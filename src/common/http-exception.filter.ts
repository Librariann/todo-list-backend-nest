import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import type { Request, Response } from "express";
import { error } from "./api-response";

/** 이 값 이상이면 서버 잘못으로 보고 Sentry/슬랙에 알린다. */
const SERVER_ERROR_STATUS = 500;
import { SlackService } from "./slack.service";

// `id` 는 pino-http 가 IncomingMessage 에 주입한다.
type AuthedRequest = Request & { user?: { id?: number; email?: string } };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly slack: SlackService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<AuthedRequest>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    let message =
      exception instanceof Error
        ? exception.message
        : "서버 오류가 발생했습니다.";
    if (typeof payload === "object" && payload && "message" in payload) {
      const value = (payload as { message: string | string[] }).message;
      message = Array.isArray(value) ? value.join(", ") : value;
    }

    if (status >= SERVER_ERROR_STATUS) {
      this.report(exception, status, message, request);
    }

    response.status(status).json(error(message));
  }

  /** 5xx 만 Sentry / 슬랙으로 보낸다. 4xx 는 클라이언트 입력 문제라 노이즈다. */
  private report(
    exception: unknown,
    status: number,
    message: string,
    request: AuthedRequest,
  ): void {
    const path = request?.originalUrl?.split("?")[0] ?? request?.url ?? "unknown";
    const method = request?.method ?? "unknown";
    const requestId = typeof request?.id === "string" ? request.id : undefined;
    const userId = request?.user?.id;

    this.logger.error(
      `${method} ${path} -> ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setTag("http.method", method);
      scope.setTag("http.path", path);
      scope.setTag("http.status", String(status));
      if (requestId) scope.setTag("request.id", requestId);
      if (userId !== undefined) scope.setUser({ id: String(userId) });
      Sentry.captureException(
        exception instanceof Error ? exception : new Error(message),
      );
    });

    const name = exception instanceof Error ? exception.name : "UnknownError";
    this.slack.notify({
      level: "error",
      title: `${status} ${method} ${path}`,
      message: `${name}: ${message}`,
      fingerprint: `5xx:${method}:${path}:${name}:${message}`,
      fields: {
        상태: status,
        요청ID: requestId,
        사용자: userId === undefined ? "비로그인" : `#${userId}`,
      },
    });
  }
}

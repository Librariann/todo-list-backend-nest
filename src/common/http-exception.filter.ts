import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { error } from "./api-response";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
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
    response.status(status).json(error(message));
  }
}

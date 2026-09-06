import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { ApiExceptionFilter } from "./http-exception.filter";
import type { SlackService } from "./slack.service";

jest.mock("@sentry/nestjs", () => ({
  captureException: jest.fn(),
  withScope: jest.fn((callback: (scope: unknown) => void) =>
    callback({
      setLevel: jest.fn(),
      setTag: jest.fn(),
      setUser: jest.fn(),
    }),
  ),
}));

interface Captured {
  status?: number;
  body?: { success: boolean; message: string };
}

function hostOf(request: unknown, captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured["body"]) {
      captured.body = body;
      return this;
    },
  };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe("ApiExceptionFilter", () => {
  const request = {
    method: "GET",
    originalUrl: "/api/todos?page=1",
    id: "req-1",
    user: { id: 7 },
  };
  let slack: { notify: jest.Mock };
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    slack = { notify: jest.fn() };
    filter = new ApiExceptionFilter(slack as unknown as SlackService);
  });

  it("4xx 는 알림을 보내지 않는다", () => {
    const captured: Captured = {};
    filter.catch(new BadRequestException("잘못된 요청"), hostOf(request, captured));

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ success: false, message: "잘못된 요청" });
    expect(slack.notify).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("5xx 는 Sentry 와 슬랙으로 보고한다", () => {
    const captured: Captured = {};
    filter.catch(
      new InternalServerErrorException("DB 연결 실패"),
      hostOf(request, captured),
    );

    expect(captured.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(slack.notify).toHaveBeenCalledTimes(1);
    const alert = slack.notify.mock.calls[0][0] as {
      level: string;
      title: string;
      fields: Record<string, unknown>;
    };
    expect(alert.level).toBe("error");
    // 쿼리스트링은 제거되어야 중복 억제가 제대로 묶인다.
    expect(alert.title).toBe("500 GET /api/todos");
    expect(alert.fields).toMatchObject({ 요청ID: "req-1", 사용자: "#7" });
  });

  it("HttpException 이 아닌 예외도 500 으로 응답한다", () => {
    const captured: Captured = {};
    filter.catch(new TypeError("undefined is not a function"), hostOf(request, captured));

    expect(captured.status).toBe(500);
    expect(slack.notify).toHaveBeenCalledTimes(1);
  });
});

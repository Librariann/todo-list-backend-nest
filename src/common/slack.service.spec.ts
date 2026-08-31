import { ConfigService } from "@nestjs/config";
import { SlackService } from "./slack.service";

function configOf(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/** notify() 는 의도적으로 fire-and-forget 이라 마이크로태스크를 비워줘야 한다. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("SlackService", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("ok") });
    global.fetch = fetchMock;
  });

  it("웹훅 URL 이 없으면 아무것도 전송하지 않는다", async () => {
    const slack = new SlackService(configOf({}));
    slack.notify({ level: "error", title: "장애" });
    await flush();
    expect(slack.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("알림을 웹훅으로 전송한다", async () => {
    const slack = new SlackService(
      configOf({ SLACK_WEBHOOK_URL: "https://hooks.example/x", NODE_ENV: "test" }),
    );
    slack.notify({ level: "error", title: "500 GET /api/todos", message: "boom" });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example/x");
    const body = JSON.parse(init.body as string) as { text: string };
    expect(body.text).toBe("[test] 500 GET /api/todos");
  });

  it("같은 fingerprint 는 중복 억제 창 안에서 한 번만 보낸다", async () => {
    const slack = new SlackService(
      configOf({
        SLACK_WEBHOOK_URL: "https://hooks.example/x",
        SLACK_ALERT_DEDUP_MINUTES: "10",
      }),
    );
    for (let i = 0; i < 5; i += 1) {
      slack.notify({ level: "error", title: "같은 에러", fingerprint: "same" });
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("전송 한도를 넘으면 더 보내지 않는다", async () => {
    const slack = new SlackService(
      configOf({
        SLACK_WEBHOOK_URL: "https://hooks.example/x",
        SLACK_ALERT_MAX_PER_5MIN: "3",
        SLACK_ALERT_DEDUP_MINUTES: "0",
      }),
    );
    for (let i = 0; i < 10; i += 1) {
      slack.notify({ level: "error", title: `에러 ${i}` });
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("웹훅이 실패해도 예외를 밖으로 던지지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const slack = new SlackService(
      configOf({ SLACK_WEBHOOK_URL: "https://hooks.example/x" }),
    );
    expect(() => slack.notify({ level: "error", title: "장애" })).not.toThrow();
    await flush();
  });
});

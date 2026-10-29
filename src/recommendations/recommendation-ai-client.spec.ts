import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RecommendationAiClient } from "./recommendation-ai-client";
import { recommendationSchema, SYSTEM_PROMPT } from "./recommendation-prompt";
import type { RecommendationContext } from "./recommendation.types";

const context: RecommendationContext = {
  today: "2026-10-30",
  from: "2026-10-01",
  recentFeedback: [],
  sources: [
    {
      sourceId: "habit:2",
      type: "habit",
      title: "독서",
      facts: { dailyTarget: 1 },
    },
  ],
};
const token = "local-test-service-token-at-least-32";
const candidate = {
  type: "todo",
  title: "독서 노트 정리하기",
  reason: "AI가 만든 이유",
  sourceIds: ["habit:2"],
  payload: { targetDate: context.today },
};

function client(url = "http://127.0.0.1:8091/v1", apiKey = token) {
  return new RecommendationAiClient(
    new ConfigService({
      QWEN_BASE_URL: url,
      QWEN_API_KEY: apiKey,
      QWEN_MODEL: "Qwen/Qwen3-4B-Instruct-2507",
    }),
  );
}

function completion(payload: unknown, finishReason = "stop") {
  return Response.json({
    choices: [
      {
        finish_reason: finishReason,
        message: { content: JSON.stringify(payload) },
      },
    ],
  });
}

describe("RecommendationAiClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("prompts Qwen directly and builds a reason from the stored history", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion({ recommendations: [candidate] }));
    await expect(client().generate(context)).resolves.toEqual([
      {
        ...candidate,
        reason: "기록한 습관 ‘독서’에서 이어갈 수 있는 제안이에요.",
      },
    ]);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url instanceof URL ? url.href : url).toBe(
      "http://127.0.0.1:8091/v1/chat/completions",
    );
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const body = request?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON body");
    expect(JSON.parse(body)).toMatchObject({
      model: "Qwen/Qwen3-4B-Instruct-2507",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { schema: recommendationSchema },
      },
    });
  });

  it.each([
    ["http://remote.example", token],
    ["http://127.0.0.1:8091", ""],
    ["https://user:password@ai.example", token],
    ["https://ai.example?token=not-a-real-token", token],
    ["https://router.huggingface.co/v1", token],
  ])(
    "disables unsafe or incomplete model configuration (%s)",
    async (url, key) => {
      const fetchMock = jest.spyOn(globalThis, "fetch");
      const ai = client(url, key);
      expect(ai.available).toBe(false);
      await expect(ai.generate(context)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    () => new Response("secret upstream body", { status: 503 }),
    () => new Response("not JSON"),
    () => new Response("x".repeat(64_001)),
    () => completion({ recommendations: [candidate] }, "length"),
    () =>
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: "invalid JSON" } }],
      }),
    () =>
      completion({
        recommendations: [{ ...candidate, sourceIds: ["habit:999"] }],
      }),
    () =>
      completion({
        recommendations: [
          { ...candidate, payload: { targetDate: "2026-10-31" } },
        ],
      }),
    () =>
      completion({
        recommendations: [candidate, candidate, candidate, candidate],
      }),
  ])(
    "rejects invalid upstream output before persistence (%#)",
    async (response) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(response());
      await expect(client().generate(context)).rejects.toThrow(
        BadGatewayException,
      );
    },
  );
});

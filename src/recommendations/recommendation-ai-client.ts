import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseRecommendations } from "./recommendation-policy";
import { recommendationSchema, SYSTEM_PROMPT } from "./recommendation-prompt";
import type {
  RecommendationContext,
  ValidRecommendation,
} from "./recommendation.types";

export function boundedInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(config.get<string>(key));
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

@Injectable()
export class RecommendationAiClient {
  constructor(private readonly config: ConfigService) {}

  private get connection(): { url: URL; token: string; model: string } | null {
    const base = this.config.get<string>("QWEN_BASE_URL")?.trim();
    const token = this.config.get<string>("QWEN_API_KEY")?.trim();
    const model =
      this.config.get<string>("QWEN_MODEL")?.trim() ||
      "Qwen/Qwen3-4B-Instruct-2507";
    if (!base || !token || token.length < 32) return null;
    try {
      const url = new URL(base);
      const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname,
      );
      if (
        (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        ["router.huggingface.co", "api.openai.com"].includes(url.hostname)
      )
        return null;
      url.pathname = url.pathname.replace(/\/+$/, "") + "/chat/completions";
      return { url, token, model };
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.connection !== null;
  }

  get timeoutMs(): number {
    return boundedInteger(
      this.config,
      "AI_RECOMMENDATIONS_TIMEOUT_MS",
      100_000,
      1000,
      190_000,
    );
  }

  async generate(
    context: RecommendationContext,
  ): Promise<ValidRecommendation[]> {
    const connection = this.connection;
    if (!connection)
      throw new ServiceUnavailableException("추천 기능을 준비하고 있어요.");

    try {
      const response = await fetch(connection.url, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.token}`,
        },
        body: JSON.stringify({
          model: connection.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(context) },
          ],
          temperature: 0.3,
          max_tokens: 1400,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "recommendations",
              strict: true,
              schema: recommendationSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("Model server unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 64_000) throw new Error("Oversized response");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        choices?: Array<{
          finish_reason?: unknown;
          message?: { content?: unknown };
        }>;
      } | null;
      const choice = raw?.choices?.[0];
      if (
        choice?.finish_reason !== "stop" ||
        typeof choice.message?.content !== "string"
      )
        throw new Error("Incomplete model response");
      return parseRecommendations(JSON.parse(choice.message.content), context);
    } catch {
      // Do not expose upstream bodies, headers or user history.
      throw new BadGatewayException(
        "추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
}

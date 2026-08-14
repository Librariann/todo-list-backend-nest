import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from "@nestjs/terminus";
import Redis from "ioredis";

/**
 * Redis 는 세션/OAuth 핸드오프에 쓰이지만 두 서비스 모두 메모리 폴백을 갖고 있다.
 * 따라서 다운되어도 컨테이너를 재시작할 이유가 없으므로 `degraded` 로 보고한다.
 */
@Injectable()
export class RedisHealthIndicator implements OnModuleDestroy {
  private readonly redis: Redis | null;
  /** ping 실패 시 드러나는 메시지는 "Connection is closed." 처럼 원인을 가리므로
   *  error 이벤트로 올라온 실제 사유를 따로 보관해 헬스 응답에 실어준다. */
  private lastError?: string;

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    config: ConfigService,
  ) {
    const url = config.get<string>("REDIS_URL")?.trim();
    this.redis = url
      ? new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
    this.redis?.on("error", (cause: Error) => {
      this.lastError = cause.message;
    });
  }

  async isHealthy(key = "redis"): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    if (!this.redis) {
      return indicator.up({ configured: false, fallback: "in-memory" });
    }
    const startedAt = Date.now();
    try {
      // "end" 는 연결이 완전히 종료된 상태라 직접 다시 열어야 한다.
      // "reconnecting" 등은 ioredis 가 알아서 복구하므로 그대로 ping 을 시도한다.
      if (this.redis.status === "wait" || this.redis.status === "end") {
        await this.redis.connect();
      }
      await this.redis.ping();
      this.lastError = undefined;
      return indicator.up({ configured: true, latencyMs: Date.now() - startedAt });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return indicator.degraded({
        configured: true,
        fallback: "in-memory",
        message: this.lastError ? `${message} (원인: ${this.lastError})` : message,
      });
    }
  }

  onModuleDestroy(): void {
    if (this.redis && this.redis.status !== "end") {
      this.redis.disconnect();
    }
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SlackService } from "../common/slack.service";
import { RedisHealthIndicator } from "./redis.health";

type Status = "up" | "down" | "degraded";

interface Tracked {
  label: string;
  status: Status | null;
  since: number;
}

/**
 * 외부 업타임 모니터가 "API 가 죽었다"를 알려준다면, 이쪽은
 * "API 는 살아있는데 DB/Redis 가 죽었다"를 알려준다.
 * 상태가 바뀌는 순간에만 슬랙으로 보낸다.
 */
@Injectable()
export class HealthMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthMonitorService.name);
  private readonly tracked: Record<string, Tracked> = {
    database: { label: "PostgreSQL", status: null, since: Date.now() },
    redis: { label: "Redis", status: null, since: Date.now() },
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisHealthIndicator,
    private readonly slack: SlackService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>("SLACK_NOTIFY_STARTUP") !== "false") {
      this.slack.notify({
        level: "info",
        title: "서버가 기동되었습니다",
        fingerprint: `startup:${process.pid}`,
        fields: {
          커밋: this.config.get<string>("RAILWAY_GIT_COMMIT_SHA")?.slice(0, 7),
        },
      });
    }
  }

  @Interval("health-monitor", 60_000)
  async probe(): Promise<void> {
    this.apply("database", await this.probeDatabase());
    this.apply("redis", await this.probeRedis());
  }

  private async probeDatabase(): Promise<Status> {
    try {
      await this.dataSource.query("SELECT 1");
      return "up";
    } catch (cause) {
      this.logger.error(
        `DB 헬스 프로브 실패: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return "down";
    }
  }

  private async probeRedis(): Promise<Status> {
    const result = await this.redis.isHealthy();
    return result.redis.status;
  }

  private apply(key: keyof typeof this.tracked, status: Status): void {
    const entry = this.tracked[key];
    if (entry.status === status) return;

    const previous = entry.status;
    const elapsed = formatDuration(Date.now() - entry.since);
    entry.status = status;
    entry.since = Date.now();

    // 최초 관측이 정상이면 굳이 알리지 않는다 (기동 알림으로 충분).
    if (previous === null && status === "up") return;

    const recovered = status === "up";
    this.slack.notify({
      level: recovered ? "info" : status === "degraded" ? "warn" : "error",
      title: recovered
        ? `${entry.label} 복구됨`
        : `${entry.label} 상태 이상 (${status})`,
      fingerprint: `health:${key}:${status}`,
      fields: {
        이전상태: previous ?? "최초확인",
        지속시간: previous === null ? undefined : elapsed,
      },
    });
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 ${minutes % 60}분` : `${Math.floor(hours / 24)}일`;
}

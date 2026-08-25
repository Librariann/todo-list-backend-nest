import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AlertLevel = "error" | "warn" | "info";

export interface SlackAlert {
  level: AlertLevel;
  title: string;
  message?: string;
  /** 표에 함께 보여줄 부가 정보 (요청 경로, 유저 등) */
  fields?: Record<string, string | number | undefined>;
  /**
   * 같은 값이면 같은 알림으로 보고 중복을 억제한다.
   * 생략하면 level + title 로 계산한다.
   */
  fingerprint?: string;
}

interface DedupEntry {
  lastSentAt: number;
  suppressed: number;
}

const COLORS: Record<AlertLevel, string> = {
  error: "#d7263d",
  warn: "#f4a300",
  info: "#2eb886",
};

const EMOJI: Record<AlertLevel, string> = {
  error: ":rotating_light:",
  warn: ":warning:",
  info: ":information_source:",
};

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly webhookUrl?: string;
  private readonly environment: string;
  private readonly dedupWindowMs: number;
  private readonly maxPerWindow: number;
  private readonly rateWindowMs = 5 * 60 * 1000;

  private readonly dedup = new Map<string, DedupEntry>();
  private windowStartedAt = Date.now();
  private sentInWindow = 0;

  constructor(config: ConfigService) {
    this.webhookUrl = config.get<string>("SLACK_WEBHOOK_URL")?.trim() || undefined;
    this.environment = config.get<string>("NODE_ENV") ?? "development";
    this.dedupWindowMs =
      Number(config.get<string>("SLACK_ALERT_DEDUP_MINUTES") ?? 10) * 60 * 1000;
    this.maxPerWindow = Number(
      config.get<string>("SLACK_ALERT_MAX_PER_5MIN") ?? 20,
    );
    if (!this.webhookUrl) {
      this.logger.log("SLACK_WEBHOOK_URL 이 없어 슬랙 알림이 비활성화되었습니다.");
    }
  }

  get enabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  /**
   * 요청 처리를 막지 않도록 전송은 항상 비동기로 던져두고 실패는 로그로만 남긴다.
   */
  notify(alert: SlackAlert): void {
    if (!this.webhookUrl) return;
    void this.send(alert).catch((cause: unknown) => {
      this.logger.warn(
        `슬랙 알림 전송 실패: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    });
  }

  private async send(alert: SlackAlert): Promise<void> {
    const key = alert.fingerprint ?? `${alert.level}:${alert.title}`;
    const now = Date.now();

    const entry = this.dedup.get(key);
    if (entry && now - entry.lastSentAt < this.dedupWindowMs) {
      entry.suppressed += 1;
      return;
    }
    if (this.isRateLimited(now)) return;

    const suppressed = entry?.suppressed ?? 0;
    this.dedup.set(key, { lastSentAt: now, suppressed: 0 });
    this.pruneDedup(now);

    const response = await fetch(this.webhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildPayload(alert, suppressed)),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`webhook ${response.status} ${await response.text()}`);
    }
  }

  private isRateLimited(now: number): boolean {
    if (now - this.windowStartedAt > this.rateWindowMs) {
      this.windowStartedAt = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= this.maxPerWindow) {
      if (this.sentInWindow === this.maxPerWindow) {
        this.sentInWindow += 1; // 한도 초과 로그는 창당 한 번만
        this.logger.warn(
          `슬랙 알림이 5분당 ${this.maxPerWindow}건 한도에 도달해 이후 알림을 생략합니다.`,
        );
      }
      return true;
    }
    this.sentInWindow += 1;
    return false;
  }

  private pruneDedup(now: number): void {
    if (this.dedup.size < 500) return;
    for (const [key, entry] of this.dedup) {
      if (now - entry.lastSentAt > this.dedupWindowMs) this.dedup.delete(key);
    }
  }

  private buildPayload(alert: SlackAlert, suppressed: number) {
    const fields = Object.entries({
      환경: this.environment,
      ...alert.fields,
    })
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([label, value]) => ({
        type: "mrkdwn",
        text: `*${label}*\n${String(value)}`,
      }));

    const blocks: unknown[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${EMOJI[alert.level]} ${alert.title}`.slice(0, 150),
          emoji: true,
        },
      },
    ];
    if (alert.message) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: codeBlock(alert.message) },
      });
    }
    // Slack section 의 fields 는 최대 10개까지만 렌더링된다.
    if (fields.length) {
      blocks.push({ type: "section", fields: fields.slice(0, 10) });
    }
    if (suppressed > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `직전 알림 이후 동일 건 ${suppressed}회가 중복 억제되었습니다.`,
          },
        ],
      });
    }

    return {
      text: `[${this.environment}] ${alert.title}`,
      attachments: [{ color: COLORS[alert.level], blocks }],
    };
  }
}

function codeBlock(message: string): string {
  const trimmed =
    message.length > 2800 ? `${message.slice(0, 2800)}\n... (생략)` : message;
  return "```\n" + trimmed + "\n```";
}

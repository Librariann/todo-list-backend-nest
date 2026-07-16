import {
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import Redis from "ioredis";

interface HandoffData {
  userId: number;
  codeChallenge: string;
  expiresAt: number;
}

@Injectable()
export class OAuthHandoffService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, HandoffData>();
  private readonly ttlSeconds = 60;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL");
    this.redis = url
      ? new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
    this.redis?.on("error", () => undefined);
  }

  async issue(userId: number, codeChallenge: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
      throw new UnauthorizedException(
        "PKCE challenge 형식이 올바르지 않습니다.",
      );
    }

    const code = randomBytes(32).toString("base64url");
    const key = this.key(code);
    const data: HandoffData = {
      userId,
      codeChallenge,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };

    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();
        await this.redis.set(key, JSON.stringify(data), "EX", this.ttlSeconds);
        return code;
      } catch {}
    }

    this.memory.set(key, data);
    return code;
  }

  async consume(code: string, codeVerifier: string): Promise<number> {
    const key = this.key(code);
    let data: HandoffData | null = null;

    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();
        const raw = await this.redis.call("GETDEL", key);
        if (typeof raw === "string") data = JSON.parse(raw) as HandoffData;
      } catch {}
    }

    if (!data) {
      data = this.memory.get(key) ?? null;
      this.memory.delete(key);
    }

    if (!data || data.expiresAt < Date.now()) {
      throw new UnauthorizedException(
        "유효하지 않거나 만료된 OAuth 인증 코드입니다.",
      );
    }

    const expected = Buffer.from(data.codeChallenge);
    const actual = Buffer.from(this.sha256(codeVerifier));
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException("PKCE 검증에 실패했습니다.");
    }

    return data.userId;
  }

  private key(code: string): string {
    return `oauth:login-code:${this.sha256(code)}`;
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value, "ascii").digest("base64url");
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.status === "ready") await this.redis.quit();
  }
}

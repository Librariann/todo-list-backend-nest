import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { randomUUID } from "crypto";
import { User } from "../entities/user.entity";

interface SessionData {
  userId: number;
  email: string;
  nickname: string;
  createdAt: number;
}

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly memory = new Map<string, SessionData>();
  private readonly redis: Redis | null;
  private readonly ttlSeconds = 7 * 24 * 60 * 60;

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

  private async write(key: string, value: string): Promise<void> {
    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();
        await this.redis.set(key, value, "EX", this.ttlSeconds);
        return;
      } catch {}
    }
    if (key.startsWith("session:"))
      this.memory.set(key.slice(8), JSON.parse(value) as SessionData);
  }

  async create(user: User): Promise<string> {
    const id = randomUUID();
    const data: SessionData = {
      userId: Number(user.id),
      email: user.email,
      nickname: user.nickname,
      createdAt: Date.now(),
    };
    await this.write(`session:${id}`, JSON.stringify(data));
    await this.write(`user:session:${user.id}`, id);
    this.memory.set(id, data);
    return id;
  }

  async isValid(id: string): Promise<boolean> {
    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();
        return (await this.redis.exists(`session:${id}`)) === 1;
      } catch {}
    }
    return this.memory.has(id);
  }

  async refresh(id: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.expire(`session:${id}`, this.ttlSeconds);
      } catch {}
    }
  }

  async invalidate(id: string): Promise<void> {
    let data = this.memory.get(id);
    if (this.redis) {
      try {
        const raw = await this.redis.get(`session:${id}`);
        if (raw) data = JSON.parse(raw) as SessionData;
        await this.redis.del(`session:${id}`);
        if (data) await this.redis.del(`user:session:${data.userId}`);
      } catch {}
    }
    this.memory.delete(id);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.status === "ready") await this.redis.quit();
  }
}

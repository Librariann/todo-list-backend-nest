import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { User, UserRole, UserStatus } from "../entities/user.entity";
import { SessionService } from "./session.service";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  nickname: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly accessMs: number;
  private readonly refreshMs: number;
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    config: ConfigService,
  ) {
    this.accessMs = Number(config.get("JWT_ACCESS_EXPIRES_MS") ?? 86400000);
    this.refreshMs = Number(config.get("JWT_REFRESH_EXPIRES_MS") ?? 604800000);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다.",
      );
    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException("비활성화된 계정입니다.");
    return this.issue(user);
  }

  async issue(user: User): Promise<LoginResult> {
    const sessionId = await this.sessions.create(user);
    const accessToken = await this.jwt.signAsync(
      { sub: user.email, sessionId },
      { expiresIn: Math.floor(this.accessMs / 1000), algorithm: "HS512" },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.email, sessionId },
      { expiresIn: Math.floor(this.refreshMs / 1000), algorithm: "HS512" },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: this.accessMs,
      nickname: user.nickname,
      email: user.email,
    };
  }

  async issueByUserId(userId: number): Promise<LoginResult> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("사용자를 찾을 수 없습니다.");
    }
    return this.issue(user);
  }

  async refresh(token: string): Promise<LoginResult> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        sessionId?: string;
      }>(token);
      if (
        payload.sessionId &&
        !(await this.sessions.isValid(payload.sessionId))
      )
        throw new UnauthorizedException("유효하지 않은 세션입니다.");
      const user = await this.users.findOneBy({ email: payload.sub });
      if (!user) throw new UnauthorizedException("사용자를 찾을 수 없습니다.");
      if (payload.sessionId) await this.sessions.refresh(payload.sessionId);
      const accessToken = await this.jwt.signAsync(
        { sub: user.email, sessionId: payload.sessionId },
        { expiresIn: Math.floor(this.accessMs / 1000), algorithm: "HS512" },
      );
      return {
        accessToken,
        refreshToken: token,
        tokenType: "Bearer",
        expiresIn: this.accessMs,
        nickname: user.nickname,
        email: user.email,
      };
    } catch (cause) {
      if (cause instanceof UnauthorizedException) throw cause;
      throw new UnauthorizedException("유효하지 않은 리프레시 토큰입니다.");
    }
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    try {
      const payload = this.jwt.decode<{ sessionId?: string }>(token);
      if (payload?.sessionId) await this.sessions.invalidate(payload.sessionId);
    } catch {}
  }

  async upsertOAuth(
    provider: string,
    providerId: string,
    email: string,
    name: string,
  ): Promise<User> {
    let user = await this.users.findOne({
      where: [{ provider, providerId }, { email }],
    });
    if (!user) {
      user = this.users.create({
        nickname: email.split("@")[0].slice(0, 40),
        email,
        name,
        password: await bcrypt.hash(crypto.randomUUID(), 12),
        provider,
        providerId,
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });
    } else {
      user.provider = provider;
      user.providerId = providerId;
      if (!user.name) user.name = name;
    }
    return this.users.save(user);
  }
}

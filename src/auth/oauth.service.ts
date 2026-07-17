import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { AuthService } from "./auth.service";

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}
  state(): string {
    return randomBytes(24).toString("hex");
  }
  private provider(name: string): ProviderConfig {
    const configs: Record<string, ProviderConfig> = {
      google: {
        clientId: this.config.get("GOOGLE_CLIENT_ID") ?? "",
        clientSecret: this.config.get("GOOGLE_CLIENT_SECRET") ?? "",
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scope: "openid email profile",
      },
      kakao: {
        clientId: this.config.get("KAKAO_CLIENT_ID") ?? "",
        clientSecret: this.config.get("KAKAO_CLIENT_SECRET") ?? "",
        authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
        tokenUrl: "https://kauth.kakao.com/oauth/token",
        userUrl: "https://kapi.kakao.com/v2/user/me",
        scope: "profile_nickname account_email",
      },
      naver: {
        clientId: this.config.get("NAVER_CLIENT_ID") ?? "",
        clientSecret: this.config.get("NAVER_CLIENT_SECRET") ?? "",
        authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
        tokenUrl: "https://nid.naver.com/oauth2.0/token",
        userUrl: "https://openapi.naver.com/v1/nid/me",
        scope: "name email",
      },
    };
    const provider = configs[name];
    if (!provider?.clientId || !provider.clientSecret)
      throw new BadRequestException(
        `${name} OAuth 환경변수가 설정되지 않았습니다.`,
      );
    return provider;
  }
  callbackUrl(name: string): string {
    return `${this.config.get("BACKEND_URL") ?? "http://localhost:8080"}/login/oauth2/code/${name}`;
  }
  authorizationUrl(name: string, state: string): string {
    const p = this.provider(name);
    const query = new URLSearchParams({
      client_id: p.clientId,
      redirect_uri: this.callbackUrl(name),
      response_type: "code",
      scope: p.scope,
      state,
    });
    return `${p.authorizeUrl}?${query}`;
  }
  async callback(name: string, code: string) {
    const p = this.provider(name);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: this.callbackUrl(name),
      code,
    });
    const tokenRes = await fetch(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok)
      throw new BadRequestException("OAuth 토큰 교환에 실패했습니다.");
    const tokens = (await tokenRes.json()) as { access_token: string };
    const userRes = await fetch(p.userUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok)
      throw new BadRequestException("OAuth 사용자 조회에 실패했습니다.");
    const raw = (await userRes.json()) as Record<string, any>;
    const profile = raw.response ?? raw;
    const account = raw.kakao_account ?? {};
    const email = String(
      profile.email ?? account.email ?? `${name}-${profile.id}@oauth.local`,
    );
    const displayName = String(
      profile.name ??
        profile.nickname ??
        profile.properties?.nickname ??
        account.profile?.nickname ??
        email.split("@")[0],
    );
    const user = await this.auth.upsertOAuth(
      name,
      String(profile.sub ?? profile.id),
      email,
      displayName,
    );
    return user;
  }
}

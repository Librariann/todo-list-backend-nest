import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { User } from "../entities/user.entity";
import { AuthService } from "./auth.service";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

interface AppleCredentials {
  identityToken: string;
  authorizationCode: string;
  nonce: string;
  fullName?: string;
}

interface AppleWebCredentials {
  authorizationCode: string;
  nonce: string;
  user?: string;
}

interface AppleTokenResponse {
  id_token?: string;
  refresh_token?: string;
}

@Injectable()
export class AppleAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  authorizationUrl(state: string, nonce: string): string {
    const query = new URLSearchParams({
      client_id: this.requiredConfig("APPLE_SERVICE_ID"),
      redirect_uri: this.webCallbackUrl(),
      response_type: "code id_token",
      response_mode: "form_post",
      scope: "name email",
      state,
      nonce,
    });
    return `${APPLE_ISSUER}/auth/authorize?${query}`;
  }

  async authenticate(credentials: AppleCredentials): Promise<User> {
    const clientId = this.requiredConfig("APPLE_CLIENT_ID");

    try {
      const payload = await this.verifyIdentityToken(
        credentials.identityToken,
        credentials.nonce,
        clientId,
      );
      const tokens = await this.exchangeAuthorizationCode(
        credentials.authorizationCode,
        clientId,
      );
      const name = credentials.fullName?.trim() || payload.email.split("@")[0];

      return this.auth.upsertOAuth(
        "apple",
        payload.sub,
        payload.email,
        name,
        tokens.refresh_token,
      );
    } catch (cause) {
      if (
        cause instanceof UnauthorizedException ||
        cause instanceof ServiceUnavailableException
      ) {
        throw cause;
      }
      throw new UnauthorizedException("Apple 로그인을 확인하지 못했습니다.");
    }
  }

  async authenticateWeb(credentials: AppleWebCredentials): Promise<User> {
    const clientId = this.requiredConfig("APPLE_SERVICE_ID");

    try {
      const tokens = await this.exchangeAuthorizationCode(
        credentials.authorizationCode,
        clientId,
        this.webCallbackUrl(),
      );
      if (!tokens.id_token) {
        throw new UnauthorizedException("Apple 로그인 정보가 없습니다.");
      }
      const payload = await this.verifyIdentityToken(
        tokens.id_token,
        credentials.nonce,
        clientId,
      );
      const name =
        this.readWebName(credentials.user) ?? payload.email.split("@")[0];

      return this.auth.upsertOAuth(
        "apple",
        payload.sub,
        payload.email,
        name,
        tokens.refresh_token,
      );
    } catch (cause) {
      if (
        cause instanceof UnauthorizedException ||
        cause instanceof ServiceUnavailableException
      ) {
        throw cause;
      }
      throw new UnauthorizedException("Apple 로그인을 확인하지 못했습니다.");
    }
  }

  private async verifyIdentityToken(
    identityToken: string,
    nonce: string,
    clientId: string,
  ): Promise<{ sub: string; email: string }> {
    const { payload } = await jwtVerify(identityToken, APPLE_KEYS, {
      issuer: APPLE_ISSUER,
      audience: clientId,
      algorithms: ["RS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      payload.nonce !== nonce ||
      (payload.email_verified !== true && payload.email_verified !== "true")
    ) {
      throw new UnauthorizedException("Apple 로그인 정보가 올바르지 않습니다.");
    }
    return { sub: payload.sub, email: payload.email };
  }

  private async exchangeAuthorizationCode(
    authorizationCode: string,
    clientId: string,
    redirectUri?: string,
  ): Promise<AppleTokenResponse> {
    const clientSecret = await this.createClientSecret(clientId);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
    });
    if (redirectUri) body.set("redirect_uri", redirectUri);
    const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = (await response.json()) as AppleTokenResponse;

    if (!response.ok) {
      throw new UnauthorizedException("Apple 인증 코드가 올바르지 않습니다.");
    }
    return result;
  }

  private webCallbackUrl(): string {
    return (
      this.config.get<string>("APPLE_REDIRECT_URI")?.trim() ||
      `${this.config.get<string>("BACKEND_URL") ?? "http://localhost:8080"}/login/oauth2/code/apple`
    );
  }

  private readWebName(rawUser?: string): string | undefined {
    if (!rawUser) return undefined;
    try {
      const user = JSON.parse(rawUser) as {
        name?: { firstName?: string; lastName?: string };
      };
      const name = [user.name?.firstName, user.name?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return name || undefined;
    } catch {
      return undefined;
    }
  }

  private async createClientSecret(clientId: string): Promise<string> {
    const teamId = this.requiredConfig("APPLE_TEAM_ID");
    const keyId = this.requiredConfig("APPLE_KEY_ID");
    const privateKey = this.requiredConfig("APPLE_PRIVATE_KEY").replace(
      /\\n/g,
      "\n",
    );
    const signingKey = await importPKCS8(privateKey, "ES256");

    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signingKey);
  }

  private requiredConfig(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        "Apple 로그인이 아직 설정되지 않았습니다.",
      );
    }
    return value;
  }
}

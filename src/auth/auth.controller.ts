import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
import { success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { AuthService } from "./auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { CurrentUser } from "./current-user.decorator";
import { OAuthHandoffService } from "./oauth-handoff.service";
import { OAuthService } from "./oauth.service";
import { Public } from "./public.decorator";

const cookieSameSite = (): "lax" | "strict" | "none" => {
  const value = process.env.COOKIE_SAME_SITE?.toLowerCase();
  return value === "strict" || value === "none" ? value : "lax";
};

class LoginDto {
  @IsEmail() email: string;
  @IsNotEmpty() password: string;
}
class RefreshDto {
  @IsOptional() @IsString() refresh?: string;
}
class OAuthExchangeDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() codeVerifier: string;
}
class WebHandoffDto {
  @IsString() @IsNotEmpty() codeChallenge: string;
}
class AppleLoginDto {
  @IsString() @IsNotEmpty() identityToken: string;
  @IsString() @IsNotEmpty() authorizationCode: string;
  @IsString() @IsNotEmpty() nonce: string;
  @IsOptional() @IsString() fullName?: string;
}
class AppleOAuthCallbackDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() error?: string;
}

const MOBILE_OAUTH_CLIENT_COOKIE = "oauth_client_mobile";
const APPLE_OAUTH_NONCE_COOKIE = "oauth_apple_nonce";

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly appleAuth: AppleAuthService,
    private readonly oauth: OAuthService,
    private readonly handoff: OAuthHandoffService,
  ) {}
  @Public()
  @Post("api/auth/mobile/apple")
  async mobileAppleLogin(@Body() dto: AppleLoginDto) {
    const user = await this.appleAuth.authenticate(dto);
    return success(
      await this.auth.issueByUserId(user.id),
      "Apple 로그인이 완료되었습니다.",
    );
  }
  @Public() @Post("api/auth/login") async login(@Body() dto: LoginDto) {
    return success(
      await this.auth.login(dto.email, dto.password),
      "로그인에 성공했습니다.",
    );
  }
  @Public() @Post("api/auth/refresh") async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Headers("authorization") header?: string,
  ) {
    const refreshCookie = req.cookies?.refresh_token as string | undefined;
    const token =
      header?.replace(/^Bearer\s+/i, "") || dto?.refresh || refreshCookie;
    if (!token) throw new UnauthorizedException("리프레시 토큰이 필요합니다.");
    const result = await this.auth.refresh(token);
    const data = {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
      nickname: result.nickname,
      email: result.email,
    };
    return { ...success(data, "토큰이 갱신되었습니다."), ...data };
  }
  @Public() @Post("api/auth/logout") async logout(
    @Headers("authorization") header?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    await this.auth.logout(header?.replace(/^Bearer\s+/i, ""));
    res?.clearCookie("refresh_token", { path: "/api/auth" });
    return success("로그아웃되었습니다.", "로그아웃에 성공했습니다.");
  }
  @Public() @Get("api/auth/oauth/authorize/:provider") authorize(
    @Param("provider") provider: string,
    @Query("code_challenge") codeChallenge: string,
    @Res() res: Response,
  ) {
    res.clearCookie(MOBILE_OAUTH_CLIENT_COOKIE);
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge ?? "")) {
      throw new UnauthorizedException(
        "PKCE challenge 형식이 올바르지 않습니다.",
      );
    }
    const state = this.oauth.state();
    const isApple = provider === "apple";
    const nonce = isApple ? this.oauth.state() : undefined;
    const cookieOptions = {
      httpOnly: true,
      secure: isApple || process.env.COOKIE_SECURE === "true",
      sameSite: isApple ? ("none" as const) : cookieSameSite(),
      maxAge: 300000,
    } as const;
    res.cookie("oauth2_state", state, cookieOptions);
    res.cookie("oauth_pkce_challenge", codeChallenge, cookieOptions);
    if (nonce) res.cookie(APPLE_OAUTH_NONCE_COOKIE, nonce, cookieOptions);
    return res.redirect(
      isApple
        ? this.appleAuth.authorizationUrl(state, nonce!)
        : this.oauth.authorizationUrl(provider, state),
    );
  }

  @Public()
  @Get("api/auth/mobile/oauth/authorize/:provider")
  mobileOAuthAuthorize(
    @Param("provider") provider: string,
    @Query("code_challenge") codeChallenge: string,
    @Res() res: Response,
  ) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge ?? "")) {
      throw new UnauthorizedException(
        "PKCE challenge 형식이 올바르지 않습니다.",
      );
    }
    const state = this.oauth.state();
    const isApple = provider === "apple";
    const nonce = isApple ? this.oauth.state() : undefined;
    const cookieOptions = {
      httpOnly: true,
      secure: isApple || process.env.COOKIE_SECURE === "true",
      sameSite: isApple ? ("none" as const) : cookieSameSite(),
      maxAge: 300000,
    } as const;
    res.cookie("oauth2_state", state, cookieOptions);
    res.cookie("oauth_pkce_challenge", codeChallenge, cookieOptions);
    res.cookie(MOBILE_OAUTH_CLIENT_COOKIE, "true", cookieOptions);
    if (nonce) res.cookie(APPLE_OAUTH_NONCE_COOKIE, nonce, cookieOptions);
    return res.redirect(
      isApple
        ? this.appleAuth.authorizationUrl(state, nonce!)
        : this.oauth.authorizationUrl(provider, state),
    );
  }

  @Public()
  @Get("login/oauth2/code/:provider")
  async callback(
    @Param("provider") provider: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.completeOAuthCallback(provider, code, state, req, res);
  }

  @Public()
  @Post("login/oauth2/code/apple")
  async appleCallback(
    @Body() dto: AppleOAuthCallbackDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.completeOAuthCallback(
      "apple",
      dto.code,
      dto.state,
      req,
      res,
      dto.user,
      dto.error,
    );
  }

  private async completeOAuthCallback(
    provider: string,
    code: string | undefined,
    state: string | undefined,
    req: Request,
    res: Response,
    appleUser?: string,
    oauthError?: string,
  ) {
    const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const mobileRedirect =
      process.env.MOBILE_OAUTH_REDIRECT_URI ?? "growdo://oauth/callback";
    const isMobile = req.cookies?.[MOBILE_OAUTH_CLIENT_COOKIE] === "true";
    const callbackUrl = isMobile
      ? mobileRedirect
      : `${frontend}/oauth/callback`;
    const codeChallenge = req.cookies?.oauth_pkce_challenge as
      string | undefined;
    const appleNonce = req.cookies?.[APPLE_OAUTH_NONCE_COOKIE] as
      string | undefined;
    if (
      oauthError ||
      !code ||
      !state ||
      state !== req.cookies?.oauth2_state ||
      !codeChallenge ||
      (provider === "apple" && !appleNonce)
    ) {
      this.clearOAuthCookies(res);
      return res.redirect(`${callbackUrl}?error=oauth_state`);
    }
    try {
      const user =
        provider === "apple"
          ? await this.appleAuth.authenticateWeb({
              authorizationCode: code,
              nonce: appleNonce!,
              user: appleUser,
            })
          : await this.oauth.callback(provider, code);
      const loginCode = await this.handoff.issue(user.id, codeChallenge);
      this.clearOAuthCookies(res);
      return res.redirect(
        `${callbackUrl}?code=${encodeURIComponent(loginCode)}`,
      );
    } catch {
      this.clearOAuthCookies(res);
      return res.redirect(`${callbackUrl}?error=oauth_failed`);
    }
  }

  private clearOAuthCookies(res: Response): void {
    res.clearCookie("oauth2_state");
    res.clearCookie("oauth_pkce_challenge");
    res.clearCookie(MOBILE_OAUTH_CLIENT_COOKIE);
    res.clearCookie(APPLE_OAUTH_NONCE_COOKIE);
  }

  @Public()
  @Post("api/auth/oauth/exchange")
  async exchange(
    @Body() dto: OAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.handoff.consume(dto.code, dto.codeVerifier);
    const result = await this.auth.issueByUserId(userId);
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: cookieSameSite(),
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    const data = {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
      nickname: result.nickname,
      email: result.email,
    };
    return success(data, "OAuth 로그인이 완료되었습니다.");
  }

  @Public()
  @Post("api/auth/mobile/oauth/exchange")
  async mobileExchange(@Body() dto: OAuthExchangeDto) {
    const userId = await this.handoff.consume(dto.code, dto.codeVerifier);
    const result = await this.auth.issueByUserId(userId);
    return success(result, "모바일 OAuth 로그인이 완료되었습니다.");
  }

  @Post("api/auth/mobile/web-handoff")
  async issueWebHandoff(@Body() dto: WebHandoffDto, @CurrentUser() user: User) {
    const code = await this.handoff.issue(user.id, dto.codeChallenge);
    return success(
      { code, expiresIn: 60 },
      "WebView 로그인 코드가 발급되었습니다.",
    );
  }
}

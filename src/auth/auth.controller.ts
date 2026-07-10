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
import { AuthService } from "./auth.service";
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

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly handoff: OAuthHandoffService,
  ) {}
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
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge ?? "")) {
      throw new UnauthorizedException(
        "PKCE challenge 형식이 올바르지 않습니다.",
      );
    }
    const state = this.oauth.state();
    res.cookie("oauth2_state", state, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: cookieSameSite(),
      maxAge: 300000,
    });
    res.cookie("oauth_pkce_challenge", codeChallenge, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: cookieSameSite(),
      maxAge: 300000,
    });
    return res.redirect(this.oauth.authorizationUrl(provider, state));
  }
  @Public() @Get("login/oauth2/code/:provider") async callback(
    @Param("provider") provider: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const codeChallenge = req.cookies?.oauth_pkce_challenge as
      string | undefined;
    if (
      !code ||
      !state ||
      state !== req.cookies?.oauth2_state ||
      !codeChallenge
    )
      return res.redirect(`${frontend}/oauth/callback?error=oauth_state`);
    try {
      const user = await this.oauth.callback(provider, code);
      const loginCode = await this.handoff.issue(user.id, codeChallenge);
      res.clearCookie("oauth2_state");
      res.clearCookie("oauth_pkce_challenge");
      return res.redirect(
        `${frontend}/oauth/callback?code=${encodeURIComponent(loginCode)}`,
      );
    } catch {
      return res.redirect(`${frontend}/oauth/callback?error=oauth_failed`);
    }
  }

  @Public() @Post("api/auth/oauth/exchange") async exchange(
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
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { SessionService } from "../auth/session.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User, UserRole } from "../entities/user.entity";
import { RegisterDto } from "./dto/register-users.dto";
import { UpdateUserDto } from "./dto/update-users.dto";
import {
  AdminUserAssetOutput,
  UserOutput,
  userResponse,
  UsersService,
} from "./users.service";

@Controller("api/users")
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto): Promise<ApiResponse<UserOutput>> {
    const result = await this.service.register(dto);
    return success(result, "회원가입이 성공적으로 완료되었습니다.");
  }

  @Public()
  @Get("check-username/:username")
  async nickname(
    @Param("username") value: string,
  ): Promise<ApiResponse<boolean>> {
    const result = await this.service.nicknameAvailable(value);
    return success(
      result,
      result
        ? "사용 가능한 사용자명입니다."
        : "이미 사용 중인 사용자명입니다.",
    );
  }

  @Public()
  @Get("check-email/:email")
  async email(@Param("email") value: string): Promise<ApiResponse<boolean>> {
    const result = await this.service.emailAvailable(value);
    return success(
      result,
      result ? "사용 가능한 이메일입니다." : "이미 사용 중인 이메일입니다.",
    );
  }

  @Public()
  @Get("health")
  health(): ApiResponse<string> {
    return success("OK", "사용자 서비스가 정상적으로 동작 중입니다.");
  }

  @Get("me")
  me(@CurrentUser() user: User): ApiResponse<UserOutput> {
    return success(userResponse(user), "내 정보 조회");
  }

  @Patch("me")
  async updateMe(
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<UserOutput>> {
    const result = await this.service.updateMe(user.id, dto);
    return success(result, "내 정보가 수정되었습니다.");
  }

  @Delete("me")
  async deleteMe(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<string>> {
    await this.service.deleteMe(user.id);
    await this.sessions.invalidateAllForUser(user.id);
    res.clearCookie("refresh_token", { path: "/api/auth" });
    return success("계정이 삭제되었습니다.", "회원 탈퇴가 완료되었습니다.");
  }

  @Get("active")
  async active(): Promise<ApiResponse<UserOutput[]>> {
    const result = await this.service.active();
    return success(result, "활성 사용자 목록 조회가 완료되었습니다.");
  }

  @Get("admin/assets")
  @Roles(UserRole.ADMIN)
  async adminAssets(): Promise<ApiResponse<AdminUserAssetOutput[]>> {
    const result = await this.service.adminAssets();
    return success(result, "사용자 자산 현황 조회가 완료되었습니다.");
  }

  @Get("username/:username")
  async byNickname(
    @Param("username") value: string,
  ): Promise<ApiResponse<UserOutput>> {
    const result = await this.service.byNickname(value);
    return success(result, "사용자 조회가 완료되었습니다.");
  }

  @Get(":id")
  async byId(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<UserOutput>> {
    const result = await this.service.byId(id);
    return success(result, "사용자 조회가 완료되었습니다.");
  }
}

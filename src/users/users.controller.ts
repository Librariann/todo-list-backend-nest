import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { RegisterDto } from "./dto/register-users.dto";
import { UserOutput, userResponse, UsersService } from "./users.service";

@Controller("api/users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

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

  @Get("active")
  async active(): Promise<ApiResponse<UserOutput[]>> {
    const result = await this.service.active();
    return success(result, "활성 사용자 목록 조회가 완료되었습니다.");
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

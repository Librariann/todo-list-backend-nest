import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { success } from "../common/api-response";
import { User, UserRole } from "../entities/user.entity";
import { userResponse, UsersService } from "./users.service";

class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/)
  nickname: string;
  @IsString() @MinLength(2) @MaxLength(50) name: string;
  @IsEmail() email: string;
  @MinLength(8) password: string;
  @IsNotEmpty() confirmPassword: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}

@Controller("api/users")
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return success(
      await this.service.register(dto),
      "회원가입이 성공적으로 완료되었습니다.",
    );
  }
  @Public()
  @Get("check-username/:username")
  async nickname(@Param("username") value: string) {
    const available = await this.service.nicknameAvailable(value);
    return success(
      available,
      available
        ? "사용 가능한 사용자명입니다."
        : "이미 사용 중인 사용자명입니다.",
    );
  }

  @Public()
  @Get("check-email/:email")
  async email(@Param("email") value: string) {
    const available = await this.service.emailAvailable(value);
    return success(
      available,
      available ? "사용 가능한 이메일입니다." : "이미 사용 중인 이메일입니다.",
    );
  }
  @Public()
  @Get("health")
  health() {
    return success("OK", "사용자 서비스가 정상적으로 동작 중입니다.");
  }

  @Get("me")
  me(@CurrentUser() user: User) {
    return success(userResponse(user), "내 정보 조회");
  }

  @Get("active")
  async active() {
    return success(
      await this.service.active(),
      "활성 사용자 목록 조회가 완료되었습니다.",
    );
  }

  @Get("username/:username")
  async byNickname(@Param("username") value: string) {
    return success(
      await this.service.byNickname(value),
      "사용자 조회가 완료되었습니다.",
    );
  }

  @Get(":id")
  async byId(@Param("id", ParseIntPipe) id: number) {
    return success(
      await this.service.byId(id),
      "사용자 조회가 완료되었습니다.",
    );
  }
}

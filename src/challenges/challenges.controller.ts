import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { success } from "../common/api-response";
import { PeriodType } from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { User } from "../entities/user.entity";
import { ChallengesService } from "./challenges.service";

class CreateChallengeDto {
  @IsString() @MinLength(4) @MaxLength(50) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsEnum(PeriodType) recurrenceType: PeriodType;
  @IsInt() targetCount: number;
  @IsInt() dailyMaxCount: number;
  @IsEnum(WorkType) workType: WorkType;
  @IsInt() point: number;
  @IsBoolean() isActive: boolean;
}
class UpdateChallengeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() recurrenceType?: PeriodType;
  @IsOptional() @IsInt() targetCount?: number;
  @IsOptional() @IsInt() point?: number;
}

@Controller("api/challenges")
export class ChallengesController {
  constructor(private readonly service: ChallengesService) {}
  @Get() async list() {
    return success(
      await this.service.list(),
      "도전과제 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Post("register") async create(@Body() dto: CreateChallengeDto) {
    return success(
      await this.service.create(dto),
      "도전과제가 성공적으로 등록 완료되었습니다.",
    );
  }
  @Patch(":id") async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateChallengeDto,
  ) {
    return success(
      await this.service.update(id, dto),
      "도전과제를 성공적으로 수정 했습니다.",
    );
  }
  @Delete(":id") async remove(@Param("id", ParseIntPipe) id: number) {
    return success(
      await this.service.remove(id),
      "도전과제를 성공적으로 삭제 완료되었습니다.",
    );
  }
}

@Controller("api/user/challenges")
export class UserChallengesController {
  constructor(private readonly service: ChallengesService) {}
  @Get() async list(@CurrentUser() user: User) {
    return success(
      await this.service.withProgress(user.id),
      "도전과제 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Get("achieved") async achieved(@CurrentUser() user: User) {
    return success(
      await this.service.achieved(user.id),
      "달성한 도전과제 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Post("progress") async progress(
    @CurrentUser() user: User,
    @Body("workType") workType: WorkType,
  ) {
    await this.service.record(user.id, workType);
    return success(null, "도전과제 진행상황이 업데이트되었습니다.");
  }
}

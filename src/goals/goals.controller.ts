import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { success } from "../common/api-response";
import { PeriodType } from "../common/date";
import { User } from "../entities/user.entity";
import { GoalsService } from "./goals.service";
class GoalDto {
  @IsString() @MinLength(4) @MaxLength(50) name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(PeriodType) recurrenceType: PeriodType;
  @IsInt() @Min(1) interval: number;
  @IsDateString() startDate: string;
  @IsInt() @Min(1) targetCount: number;
  @IsOptional() isActive?: boolean;
}
@Controller("api/goals")
export class GoalsController {
  constructor(private readonly service: GoalsService) {}
  @Get("dashboard") async dashboard(@CurrentUser() user: User) {
    return success(await this.service.dashboard(user.id), "대시보드 조회 성공");
  }
  @Get() async list(@CurrentUser() user: User) {
    return success(await this.service.list(user.id), "목표 목록 조회 성공");
  }
  @Get(":id/progress") async progress(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.progress(user.id, id),
      "진행상황 조회 성공",
    );
  }
  @Get(":id/streaks") async streak(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(await this.service.streak(user.id, id), "스트릭 조회 성공");
  }
  @Get(":id") async get(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(await this.service.get(user.id, id), "목표 상세 조회 성공");
  }
  @Post() async create(@Body() dto: GoalDto, @CurrentUser() user: User) {
    return success(await this.service.create(user.id, dto), "목표 생성 성공");
  }
  @Put(":id") async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: GoalDto,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.update(user.id, id, dto),
      "목표 수정 성공",
    );
  }
  @Post(":id/achieve") async achieve(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    const result = await this.service.achieve(user.id, id);
    return success(
      result.data,
      result.achieved
        ? "목표 달성 완료! 포인트가 지급되었습니다."
        : "목표 진행도가 업데이트되었습니다.",
    );
  }
  @Delete(":id") async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    await this.service.deactivate(user.id, id);
    return success(null, "목표 비활성화 성공");
  }
}

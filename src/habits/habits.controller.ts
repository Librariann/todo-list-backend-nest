import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { HabitsService } from "./habits.service";
class CreateHabitDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsInt()
  @Min(1)
  dailyTarget: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}
class UpdateHabitDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyTarget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}
@Controller("api/habits")
export class HabitsController {
  constructor(private readonly service: HabitsService) {}

  @Get()
  async list(@CurrentUser() user: User) {
    return success(await this.service.list(user.id), "습관 목록 조회 성공");
  }
  @Post("register")
  async create(@Body() dto: CreateHabitDto, @CurrentUser() user: User) {
    return success(await this.service.create(user.id, dto), "습관 생성 성공");
  }
  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateHabitDto,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.update(user.id, id, dto),
      "습관 수정 성공",
    );
  }
  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    await this.service.deactivate(user.id, id);
    return success(null, "습관 비활성화 성공");
  }
  @Post(":id/increment")
  async increment(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.increment(user.id, id);
    return success(
      data,
      data.todayAchieved ? "목표 달성!" : "카운터 증가 성공",
    );
  }
  @Post(":id/decrement")
  async decrement(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.decrement(user.id, id),
      "카운터 감소 성공",
    );
  }
  @Get(":id/logs")
  async logs(
    @Param("id", ParseIntPipe) id: number,
    @Query("from") from: string,
    @Query("to") to: string,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.history(user.id, id, from, to),
      "습관 로그 조회 성공",
    );
  }
}

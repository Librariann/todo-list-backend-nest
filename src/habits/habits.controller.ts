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
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { CreateHabitDto } from "./dto/create-habits.dto";
import { UpdateHabitDto } from "./dto/update-habits.dto";
import {
  HabitHistoryOutput,
  HabitOutput,
  HabitsService,
} from "./habits.service";
@Controller("api/habits")
export class HabitsController {
  constructor(private readonly service: HabitsService) {}

  @Get()
  async list(@CurrentUser() user: User): Promise<ApiResponse<HabitOutput[]>> {
    const result = await this.service.list(user.id);
    return success(result, "습관 목록 조회 성공");
  }

  @Post("register")
  async create(
    @Body() dto: CreateHabitDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<HabitOutput>> {
    const result = await this.service.create(user.id, dto);
    return success(result, "습관 생성 성공");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateHabitDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<HabitOutput>> {
    const result = await this.service.update(user.id, id, dto);
    return success(result, "습관 수정 성공");
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.service.deactivate(user.id, id);
    return success(null, "습관 비활성화 성공");
  }

  @Post(":id/increment")
  async increment(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<HabitOutput>> {
    const result = await this.service.increment(user.id, id);
    return success(
      result,
      result.todayAchieved ? "목표 달성!" : "카운터 증가 성공",
    );
  }

  @Post(":id/decrement")
  async decrement(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<HabitOutput>> {
    const result = await this.service.decrement(user.id, id);
    return success(result, "카운터 감소 성공");
  }

  @Get(":id/logs")
  async logs(
    @Param("id", ParseIntPipe) id: number,
    @Query("from") from: string,
    @Query("to") to: string,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<HabitHistoryOutput[]>> {
    const result = await this.service.history(user.id, id, from, to);
    return success(result, "습관 로그 조회 성공");
  }
}

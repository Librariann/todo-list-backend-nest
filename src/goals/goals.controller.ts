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
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User } from "../entities/user.entity";
import {
  GoalDashboardOutput,
  GoalOutput,
  GoalProcessOutput,
  GoalsService,
  GoalStreakOutput,
} from "./goals.service";
import { CreateGoalDto } from "./dto/create-goals.dto";

@Controller("api/goals")
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get("dashboard")
  async dashboard(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalDashboardOutput>> {
    const result = await this.service.dashboard(user.id);
    return success(result, "대시보드 조회 성공");
  }

  @Get()
  async list(@CurrentUser() user: User): Promise<ApiResponse<GoalOutput[]>> {
    const result = await this.service.list(user.id);
    return success(result, "목표 목록 조회 성공");
  }

  @Get(":id/progress")
  async progress(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalProcessOutput | null>> {
    const result = await this.service.progress(user.id, id);
    return success(result, "진행상황 조회 성공");
  }

  @Get(":id/streaks")
  async streak(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalStreakOutput | null>> {
    const result = await this.service.streak(user.id, id);
    return success(result, "스트릭 조회 성공");
  }

  @Get(":id")
  async get(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalOutput>> {
    const result = await this.service.get(user.id, id);
    return success(result, "목표 상세 조회 성공");
  }

  @Post()
  async create(
    @Body() dto: CreateGoalDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalOutput>> {
    const result = await this.service.create(user.id, dto);
    return success(result, "목표 생성 성공");
  }

  @Put(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateGoalDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalOutput>> {
    const result = await this.service.update(user.id, id, dto);
    return success(result, "목표 수정 성공");
  }

  @Post(":id/achieve")
  async achieve(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<GoalProcessOutput>> {
    const result = await this.service.achieve(user.id, id);
    return success(
      result.data,
      result.achieved
        ? "목표 달성 완료! 포인트가 지급되었습니다."
        : "목표 진행도가 업데이트되었습니다.",
    );
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.service.deactivate(user.id, id);
    return success(null, "목표 비활성화 성공");
  }
}

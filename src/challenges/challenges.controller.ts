import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { PeriodType } from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { User, UserRole } from "../entities/user.entity";
import {
  ChallengeAchievementOutput,
  ChallengeOutput,
  ChallengeProgressOutput,
  ChallengeRotationPreviewOutput,
  ChallengeRotationRunOutput,
  ChallengeRotationSettingOutput,
  ChallengesService,
} from "./challenges.service";
import { CreateChallengeDto } from "./dto/create-challenges.dto";
import { RerollChallengeRotationDto } from "./dto/reroll-challenge-rotation.dto";
import { UpdateChallengeRotationSettingDto } from "./dto/update-challenge-rotation-setting.dto";
import { UpdateChallengeDto } from "./dto/update-challenges.dto";

@Controller("api/challenges")
export class ChallengesController {
  constructor(private readonly service: ChallengesService) {}

  @Get()
  async list(): Promise<ApiResponse<ChallengeOutput[]>> {
    const result = await this.service.list();
    return success(result, "도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Get("rotation-settings")
  @Roles(UserRole.ADMIN)
  async rotationSettings(): Promise<
    ApiResponse<ChallengeRotationSettingOutput[]>
  > {
    const result = await this.service.rotationSettings();
    return success(result, "도전과제 순환 설정을 불러왔습니다.");
  }

  @Patch("rotation-settings/:periodType")
  @Roles(UserRole.ADMIN)
  async updateRotationSetting(
    @Param("periodType", new ParseEnumPipe(PeriodType))
    periodType: PeriodType,
    @Body() dto: UpdateChallengeRotationSettingDto,
  ): Promise<ApiResponse<ChallengeRotationSettingOutput>> {
    const result = await this.service.updateRotationSetting(
      periodType,
      dto.selectionCount,
      dto.cooldownPeriods,
    );
    return success(result, "도전과제 순환 설정을 수정했습니다.");
  }

  @Get("rotation-history/:periodType")
  @Roles(UserRole.ADMIN)
  async rotationHistory(
    @Param("periodType", new ParseEnumPipe(PeriodType)) periodType: PeriodType,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ): Promise<ApiResponse<ChallengeRotationRunOutput[]>> {
    const result = await this.service.rotationHistory(periodType, limit);
    return success(result, "도전과제 순환 이력을 불러왔습니다.");
  }

  @Post("rotation-preview/:periodType")
  @Roles(UserRole.ADMIN)
  async previewRotation(
    @Param("periodType", new ParseEnumPipe(PeriodType)) periodType: PeriodType,
  ): Promise<ApiResponse<ChallengeRotationPreviewOutput>> {
    const result = await this.service.previewRotation(periodType);
    return success(result, "재선발 예상 결과를 만들었습니다.");
  }

  @Post("rotation-reroll/:periodType")
  @Roles(UserRole.ADMIN)
  async rerollRotation(
    @Param("periodType", new ParseEnumPipe(PeriodType)) periodType: PeriodType,
    @CurrentUser() user: User,
    @Body() dto: RerollChallengeRotationDto,
  ): Promise<ApiResponse<ChallengeOutput[]>> {
    const result = await this.service.rerollRotation(
      periodType,
      user.id,
      undefined,
      dto.challengeIds,
    );
    return success(
      result.map((assignment) => ({
        id: Number(assignment.challengeId),
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        name: assignment.name,
        description: assignment.description,
        icon: assignment.icon,
        recurrenceType: assignment.periodType,
        workType: assignment.workType,
        targetCount: assignment.targetCount,
        dailyMaxCount: assignment.dailyMaxCount,
        point: assignment.point,
        isActive: assignment.challenge?.isActive ?? true,
        isSelected: true,
      })),
      "현재 기간의 도전과제를 다시 선발했습니다.",
    );
  }

  @Post("register")
  async create(
    @Body() dto: CreateChallengeDto,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.create(dto);
    return success(result, "도전과제가 성공적으로 등록 완료되었습니다.");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateChallengeDto,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.update(id, dto);
    return success(result, "도전과제를 성공적으로 수정 했습니다.");
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.remove(id);
    return success(result, "도전과제를 성공적으로 삭제 완료되었습니다.");
  }
}

@Controller("api/user/challenges")
export class UserChallengesController {
  constructor(private readonly service: ChallengesService) {}

  @Get()
  async list(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<ChallengeProgressOutput[]>> {
    const result = await this.service.withProgress(user.id);
    return success(result, "도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Get("achieved")
  async achieved(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<ChallengeProgressOutput[]>> {
    const result = await this.service.achieved(user.id);
    return success(result, "달성한 도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Post("progress")
  async progress(
    @CurrentUser() user: User,
    @Body("workType") workType: WorkType,
  ): Promise<ApiResponse<ChallengeAchievementOutput[]>> {
    const result = await this.service.record(user.id, workType);
    return success(result, "도전과제 진행상황이 업데이트되었습니다.");
  }
}

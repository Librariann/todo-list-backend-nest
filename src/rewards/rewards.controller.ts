import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User, UserRole } from "../entities/user.entity";
import { CreateRewardDto } from "./dto/create-rewards.dto";
import { ReorderRewardsDto } from "./dto/reorder-rewards.dto";
import { UpdateRewardDto } from "./dto/update-rewards.dto";
import {
  RewardOutput,
  RewardsService,
  UserRewardOutput,
} from "./rewards.service";
@Controller("api/rewards")
export class RewardsController {
  constructor(private readonly service: RewardsService) {}

  @Get()
  async list(): Promise<ApiResponse<RewardOutput[]>> {
    const result = await this.service.list();
    return success(result, "보상 목록을 성공적으로 불러왔습니다.");
  }

  @Get(":id")
  async get(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<RewardOutput>> {
    const result = await this.service.get(id);
    return success(result, "보상을 성공적으로 불러왔습니다.");
  }

  @Post("register")
  @Roles(UserRole.ADMIN)
  async create(
    @Body() dto: CreateRewardDto,
  ): Promise<ApiResponse<RewardOutput>> {
    const result = await this.service.create({
      discount: false,
      discountRate: 0,
      isActive: true,
      exchangeEnabled: true,
      stockQuantity: 0,
      ...dto,
    });
    return success(result, "보상이 성공적으로 등록 완료되었습니다.");
  }

  @Patch("order")
  @Roles(UserRole.ADMIN)
  async reorder(
    @Body() dto: ReorderRewardsDto,
  ): Promise<ApiResponse<RewardOutput[]>> {
    const result = await this.service.reorder(dto);
    return success(result, "보상 순서가 저장되었습니다.");
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateRewardDto,
  ): Promise<ApiResponse<RewardOutput>> {
    const result = await this.service.update(id, dto);
    return success(result, "보상이 성공적으로 수정 완료되었습니다.");
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  async remove(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<RewardOutput>> {
    const result = await this.service.remove(id);
    return success(result, "보상이 성공적으로 삭제 완료되었습니다.");
  }
}
@Controller("api/user/rewards")
export class UserRewardsController {
  constructor(private readonly service: RewardsService) {}

  @Get()
  async list(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<UserRewardOutput[]>> {
    const result = await this.service.userList(user.id);
    return success(result, "받은 보상 목록을 성공적으로 불러왔습니다.");
  }

  @Post(":id/redeem")
  async redeem(
    @Param("id", ParseIntPipe) id: number,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<UserRewardOutput>> {
    if (!idempotencyKey || !isUUID(idempotencyKey, "4")) {
      throw new BadRequestException("유효한 교환 요청 키가 필요합니다.");
    }

    const result = await this.service.redeem(user.id, id, idempotencyKey);
    return success(result, "보상이 성공적으로 지급되었습니다");
  }

  @Patch(":id")
  async use(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<UserRewardOutput>> {
    const result = await this.service.use(user.id, id);
    return success(result, "보상이 성공적으로 사용 완료되었습니다.");
  }
}

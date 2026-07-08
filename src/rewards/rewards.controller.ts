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
import { RewardType } from "../entities/reward.entity";
import { User } from "../entities/user.entity";
import { RewardsService } from "./rewards.service";
class CreateRewardDto {
  @IsString() @MinLength(4) @MaxLength(50) name: string;
  @IsEnum(RewardType) type: RewardType;
  @IsInt() point: number;
  @IsString() description: string;
  @IsOptional() @IsBoolean() discount?: boolean;
  @IsOptional() @IsInt() discountRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateRewardDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(RewardType) type?: RewardType;
  @IsOptional() @IsInt() point?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() discount?: boolean;
  @IsOptional() @IsInt() discountRate?: number;
}
@Controller("api/rewards")
export class RewardsController {
  constructor(private readonly service: RewardsService) {}
  @Get() async list() {
    return success(
      await this.service.list(),
      "보상 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Get(":id") async get(@Param("id", ParseIntPipe) id: number) {
    return success(
      await this.service.get(id),
      "보상을 성공적으로 불러왔습니다.",
    );
  }
  @Post("register") async create(@Body() dto: CreateRewardDto) {
    return success(
      await this.service.create({
        discount: false,
        discountRate: 0,
        isActive: true,
        ...dto,
      }),
      "보상이 성공적으로 등록 완료되었습니다.",
    );
  }
  @Patch(":id") async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateRewardDto,
  ) {
    return success(
      await this.service.update(id, dto),
      "보상이 성공적으로 수정 완료되었습니다.",
    );
  }
  @Delete(":id") async remove(@Param("id", ParseIntPipe) id: number) {
    return success(
      await this.service.remove(id),
      "보상이 성공적으로 삭제 완료되었습니다.",
    );
  }
}
@Controller("api/user/rewards")
export class UserRewardsController {
  constructor(private readonly service: RewardsService) {}
  @Get() async list(@CurrentUser() user: User) {
    return success(
      await this.service.userList(user.id),
      "받은 보상 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Post(":id/redeem") async redeem(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.redeem(user.id, id),
      "보상이 성공적으로 지급되었습니다",
    );
  }
  @Patch(":id") async use(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.use(user.id, id),
      "보상이 성공적으로 사용 완료되었습니다.",
    );
  }
}

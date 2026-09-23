import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { UserRole } from "../entities/user.entity";
import { CreateRewardCouponDto } from "./dto/create-reward-coupon.dto";
import { UpdateRewardCouponStatusDto } from "./dto/update-reward-coupon-status.dto";
import {
  COUPON_IMAGE_MAX_BYTES,
  CouponImageUpload,
  CouponInventoryOutput,
  RewardCouponsService,
} from "./reward-coupons.service";

@Roles(UserRole.ADMIN)
@Controller("api/admin/rewards/:rewardId/coupons")
export class RewardCouponsController {
  constructor(private readonly service: RewardCouponsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Param("rewardId", ParseIntPipe) rewardId: number,
  ): Promise<ApiResponse<CouponInventoryOutput[]>> {
    const result = await this.service.list(rewardId);
    return success(result, "쿠폰 재고 조회 성공");
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: COUPON_IMAGE_MAX_BYTES, files: 1, fields: 3 },
    }),
  )
  async create(
    @Param("rewardId", ParseIntPipe) rewardId: number,
    @Body() dto: CreateRewardCouponDto,
    @UploadedFile() image?: CouponImageUpload,
  ): Promise<ApiResponse<CouponInventoryOutput>> {
    const result = await this.service.create(rewardId, dto, image);
    return success(result, "쿠폰 등록 성공");
  }

  @Patch(":couponId/status")
  async updateStatus(
    @Param("rewardId", ParseIntPipe) rewardId: number,
    @Param("couponId", ParseIntPipe) couponId: number,
    @Body() dto: UpdateRewardCouponStatusDto,
  ): Promise<ApiResponse<CouponInventoryOutput>> {
    const result = await this.service.updateStatus(rewardId, couponId, dto);
    return success(result, "쿠폰 상태 변경 성공");
  }
}

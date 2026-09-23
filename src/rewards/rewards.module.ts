import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RewardRedemption } from "../entities/reward-redemption.entity";
import { RewardCoupon } from "../entities/reward-coupon.entity";
import { Reward, UserReward } from "../entities/reward.entity";
import { PointsModule } from "../points/points.module";
import { RewardsController, UserRewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import { CouponCryptoService } from "./coupon-crypto.service";
import { CouponStorageService } from "./coupon-storage.service";
import { RewardCouponsController } from "./reward-coupons.controller";
import { RewardCouponsService } from "./reward-coupons.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Reward,
      UserReward,
      RewardRedemption,
      RewardCoupon,
    ]),
    PointsModule,
  ],
  controllers: [
    RewardsController,
    UserRewardsController,
    RewardCouponsController,
  ],
  providers: [
    RewardsService,
    RewardCouponsService,
    CouponCryptoService,
    CouponStorageService,
  ],
  exports: [RewardsService],
})
export class RewardsModule {}

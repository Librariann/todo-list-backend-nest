import { IsIn } from "class-validator";
import { RewardCouponStatus } from "../../entities/reward-coupon.entity";

export class UpdateRewardCouponStatusDto {
  @IsIn([RewardCouponStatus.AVAILABLE, RewardCouponStatus.DISABLED])
  status: RewardCouponStatus.AVAILABLE | RewardCouponStatus.DISABLED;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Reward, UserReward } from "./reward.entity";
import { User } from "./user.entity";

export enum CouponProvider {
  GIFTISHOW = "GIFTISHOW",
}

export enum RewardCouponStatus {
  AVAILABLE = "AVAILABLE",
  ASSIGNED = "ASSIGNED",
  USED = "USED",
  DISABLED = "DISABLED",
  EXPIRED = "EXPIRED",
}

@Entity({ name: "reward_coupons", schema: "todo_list" })
@Index("idx_reward_coupons_available", ["rewardId", "status", "expiresAt"])
@Index("uq_reward_coupons_pin_hash", ["pinHash"], { unique: true })
@Index("uq_reward_coupons_user_reward", ["userRewardId"], { unique: true })
export class RewardCoupon extends BaseEntity {
  @ManyToOne(() => Reward, { nullable: false })
  @JoinColumn({ name: "reward_id" })
  reward: Reward;

  @Column({ name: "reward_id", type: "bigint" })
  rewardId: number;

  @Column({ type: "varchar", length: 20, default: CouponProvider.GIFTISHOW })
  provider: CouponProvider;

  @Column({
    name: "provider_order_number",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  providerOrderNumber: string | null;

  @Column({ name: "encrypted_pin", type: "text", select: false })
  encryptedPin: string;

  @Column({ name: "pin_hash", type: "varchar", length: 64, select: false })
  pinHash: string;

  @Column({ name: "pin_last_four", type: "varchar", length: 4 })
  pinLastFour: string;

  @Column({
    name: "image_object_key",
    type: "varchar",
    length: 300,
    select: false,
  })
  imageObjectKey: string;

  @Column({ name: "image_content_type", type: "varchar", length: 30 })
  imageContentType: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({
    type: "varchar",
    length: 20,
    default: RewardCouponStatus.AVAILABLE,
  })
  status: RewardCouponStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigned_user_id" })
  assignedUser: User | null;

  @Column({ name: "assigned_user_id", type: "bigint", nullable: true })
  assignedUserId: number | null;

  @ManyToOne(() => UserReward, { nullable: true })
  @JoinColumn({ name: "user_reward_id" })
  userReward: UserReward | null;

  @Column({ name: "user_reward_id", type: "bigint", nullable: true })
  userRewardId: number | null;

  @Column({ name: "assigned_at", type: "timestamptz", nullable: true })
  assignedAt: Date | null;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;
}

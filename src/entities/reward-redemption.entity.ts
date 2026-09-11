import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Reward, UserReward } from "./reward.entity";
import { User } from "./user.entity";

export enum RewardRedemptionStatus {
  PENDING = "PENDING", // 교환 처리 중
  COMPLETED = "COMPLETED", // 교환 처리 완료
  FAILED = "FAILED", // 교환 처리 실패
  REFUNDED = "REFUNDED", // 포인트 반환 완료
}

@Entity({ name: "reward_redemptions", schema: "todo_list" })
@Index("uq_reward_redemptions_user_key", ["userId", "idempotencyKey"], {
  unique: true,
})
export class RewardRedemption extends BaseEntity {
  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @ManyToOne(() => Reward, { nullable: false })
  @JoinColumn({ name: "reward_id" })
  reward: Reward;

  @Column({ name: "reward_id", type: "bigint" })
  rewardId: number;

  @Column({ name: "idempotency_key", type: "varchar", length: 36 })
  idempotencyKey: string;

  @Column()
  point: number;

  @Column({
    type: "varchar",
    length: 20,
    default: RewardRedemptionStatus.PENDING,
  })
  status: RewardRedemptionStatus;

  @ManyToOne(() => UserReward, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_reward_id" })
  userReward: UserReward | null;

  @Column({
    name: "user_reward_id",
    type: "bigint",
    nullable: true,
    unique: true,
  })
  userRewardId: number | null;
}

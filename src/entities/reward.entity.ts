import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export enum RewardType {
  COUPON = "COUPON",
  POINT = "POINT",
}
@Entity({ name: "rewards", schema: "todo_list" })
export class Reward extends BaseEntity {
  @Column({ length: 50 }) name: string;
  @Column({ type: "varchar", length: 10, default: RewardType.POINT })
  type: RewardType;
  @Column() point: number;
  @Column({ length: 50 }) description: string;
  @Column({ default: false }) discount: boolean;
  @Column({ name: "discount_rate", default: 0 }) discountRate: number;
  @Column({ name: "is_active", default: true }) isActive: boolean;
}

@Entity({ name: "user_rewards", schema: "todo_list" })
export class UserReward extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;
  @Column({ name: "user_id", type: "bigint" }) userId: number;
  @ManyToOne(() => Reward, { nullable: false })
  @JoinColumn({ name: "reward_id" })
  reward: Reward;
  @Column({ name: "reward_id", type: "bigint" }) rewardId: number;
  @Column({ name: "reward_name", length: 50 }) rewardName: string;
  @Column({ name: "reward_type", type: "varchar", length: 10 })
  rewardType: RewardType;
  @Column({ name: "reward_point" }) rewardPoint: number;
  @Column({ name: "reward_description", length: 50 }) rewardDescription: string;
  @Column({ default: false }) discount: boolean;
  @Column({ name: "discount_rate", default: 0 }) discountRate: number;
  @Column({ name: "is_used", default: false }) isUsed: boolean;
}

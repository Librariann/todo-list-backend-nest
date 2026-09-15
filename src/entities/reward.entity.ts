import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export enum RewardType {
  COUPON = "COUPON",
  POINT = "POINT",
}
@Entity({ name: "rewards", schema: "todo_list" })
export class Reward extends BaseEntity {
  @Column({ length: 50 })
  name: string;

  @Column({ type: "varchar", length: 10, default: RewardType.COUPON })
  type: RewardType;

  @Column()
  point: number;

  @Column({ length: 50 })
  description: string;

  @Column({ default: false })
  discount: boolean;

  @Column({ name: "discount_rate", default: 0 })
  discountRate: number;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "image_url", type: "varchar", length: 1000, nullable: true })
  imageUrl: string | null;

  @Column({ name: "available_from", type: "timestamptz", nullable: true })
  availableFrom: Date | null;

  @Column({ name: "exchange_enabled", default: true })
  exchangeEnabled: boolean;

  @Column({ name: "stock_quantity", default: 0 })
  stockQuantity: number;
}

@Entity({ name: "user_rewards", schema: "todo_list" })
export class UserReward extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @ManyToOne(() => Reward, { nullable: false })
  @JoinColumn({ name: "reward_id" })
  reward: Reward;

  @Column({ name: "reward_id", type: "bigint" })
  rewardId: number;

  @Column({ name: "reward_name", length: 50 })
  rewardName: string;

  @Column({ name: "reward_type", type: "varchar", length: 10 })
  rewardType: RewardType;

  @Column({ name: "reward_point" })
  rewardPoint: number;

  @Column({ name: "reward_description", length: 50 })
  rewardDescription: string;

  @Column({ default: false })
  discount: boolean;

  @Column({ name: "discount_rate", default: 0 })
  discountRate: number;

  @Column({ name: "is_used", default: false })
  isUsed: boolean;

  @Column({
    name: "reward_image_url",
    type: "varchar",
    length: 1000,
    nullable: true,
  })
  rewardImageUrl: string | null;
}

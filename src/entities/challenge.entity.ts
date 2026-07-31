import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { PeriodType } from "../common/date";
import { User } from "./user.entity";

export enum WorkType {
  HABITS = "HABITS",
  TODOS = "TODOS",
  GOALS = "GOALS",
}
@Entity({ name: "challenges", schema: "todo_list" })
export class Challenge extends BaseEntity {
  @Column() name: string;
  @Column({ type: "varchar", nullable: true }) description: string | null;
  @Column({ type: "varchar", nullable: true }) icon: string | null;
  @Column({ name: "recurrence_type", type: "varchar" })
  recurrenceType: PeriodType;
  @Column({ name: "work_type", type: "varchar" }) workType: WorkType;
  @Column({ name: "target_count" }) targetCount: number;
  @Column({ name: "daily_max_count" }) dailyMaxCount: number;
  @Column() point: number;
  @Column({ name: "is_active", default: false }) isActive: boolean;
}

@Entity({ name: "user_progress_challenges", schema: "todo_list" })
@Unique(["userId", "challengeId", "periodType", "periodKey"])
export class UserProgressChallenge extends BaseEntity {
  @ManyToOne(() => Challenge, { nullable: false })
  @JoinColumn({ name: "challenges_id" })
  challenge: Challenge;
  @Column({ name: "challenges_id", type: "bigint" }) challengeId: number;
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;
  @Column({ name: "user_id", type: "bigint" }) userId: number;
  @Column({ name: "period_type", type: "varchar" }) periodType: PeriodType;
  @Column({ name: "period_key" }) periodKey: string;
  @Column({ name: "current_count" }) currentCount: number;
  @Column({ name: "is_achieved" }) isAchieved: boolean;
}

import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { PeriodType } from "../common/date";
import { User } from "./user.entity";

@Entity({ name: "goals", schema: "todo_list" })
export class Goal extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ type: "varchar", nullable: true, length: 255 })
  description: string | null;

  @Column({ name: "recurrence_type", type: "varchar" })
  recurrenceType: PeriodType;

  @Column({ default: 1 }) interval: number;

  @Column({ name: "start_date", type: "date" })
  startDate: string;

  @Column({ name: "target_count", default: 1 })
  targetCount: number;

  @Column({ name: "is_active", default: true })
  isActive: boolean;
}

@Entity({ name: "goal_process", schema: "todo_list" })
export class GoalProcess extends BaseEntity {
  @ManyToOne(() => Goal, { nullable: false })
  @JoinColumn({ name: "goals_id" })
  goal: Goal;

  @Column({ name: "goals_id", type: "bigint" })
  goalId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "period_index", default: 1 })
  periodIndex: number;

  @Column({ name: "period_start", type: "date" })
  periodStart: string;

  @Column({ name: "period_end", type: "date" })
  periodEnd: string;

  @Column({ name: "current_count" })
  currentCount: number;

  @Column({ name: "is_achieved" })
  isAchieved: boolean;

  @Column({ name: "is_finalized" })
  isFinalized: boolean;
}

@Entity({ name: "goal_streaks", schema: "todo_list" })
export class GoalStreak extends BaseEntity {
  @ManyToOne(() => Goal, { nullable: false })
  @JoinColumn({ name: "goals_id" })
  goal: Goal;

  @Column({ name: "goals_id", type: "bigint" })
  goalId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "current_streak", default: 0 })
  currentStreak: number;

  @Column({ name: "longest_streak", default: 0 })
  longestStreak: number;
}

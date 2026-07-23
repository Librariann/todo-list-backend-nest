import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { PeriodType } from "../common/date";
import { User } from "./user.entity";

export enum WorkType {
  HABITS = "HABITS",
  TODOS = "TODOS",
  GOALS = "GOALS",
}

export enum ChallengeRotationTrigger {
  CRON = "CRON",
  LAZY = "LAZY",
  MANUAL = "MANUAL",
  LEGACY = "LEGACY",
}

export enum ChallengeRotationStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}
@Entity({ name: "challenges", schema: "todo_list" })
export class Challenge extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: "varchar", nullable: true })
  description: string | null;

  @Column({ type: "varchar", nullable: true })
  icon: string | null;
  @Column({ name: "recurrence_type", type: "varchar" })
  recurrenceType: PeriodType;

  @Column({ name: "work_type", type: "varchar" })
  workType: WorkType;

  @Column({ name: "target_count" })
  targetCount: number;

  @Column({ name: "daily_max_count" })
  dailyMaxCount: number;

  @Column()
  point: number;

  @Column({ name: "is_active", default: false })
  isActive: boolean;
}

@Entity({ name: "challenge_assignments", schema: "todo_list" })
@Unique("uq_challenge_assignments_period_position", [
  "periodType",
  "periodKey",
  "position",
])
@Unique("uq_challenge_assignments_period_challenge", [
  "periodType",
  "periodKey",
  "challengeId",
])
export class ChallengeAssignment extends BaseEntity {
  @ManyToOne(() => Challenge, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "challenge_id" })
  challenge: Challenge;

  @Column({ name: "challenge_id", type: "bigint" })
  challengeId: number;

  @Column({ name: "period_type", type: "varchar" })
  periodType: PeriodType;

  @Column({ name: "period_key", type: "date" })
  periodKey: string;

  @Column({ type: "smallint" })
  position: number;

  @Column()
  name: string;

  @Column({ type: "varchar", nullable: true })
  description: string | null;

  @Column({ type: "varchar", nullable: true })
  icon: string | null;

  @Column({ name: "work_type", type: "varchar" })
  workType: WorkType;

  @Column({ name: "target_count" })
  targetCount: number;

  @Column({ name: "daily_max_count" })
  dailyMaxCount: number;

  @Column({ name: "reward_point" })
  point: number;
}

@Entity({ name: "challenge_rotation_settings", schema: "todo_list" })
@Unique(["periodType"])
export class ChallengeRotationSetting extends BaseEntity {
  @Column({ name: "period_type", type: "varchar" })
  periodType: PeriodType;

  @Column({ name: "selection_count", type: "smallint", default: 5 })
  selectionCount: number;

  @Column({ name: "cooldown_periods", type: "smallint", default: 2 })
  cooldownPeriods: number;
}

@Entity({ name: "challenge_rotation_runs", schema: "todo_list" })
export class ChallengeRotationRun extends BaseEntity {
  @Column({ name: "period_type", type: "varchar" })
  periodType: PeriodType;

  @Column({ name: "period_key", type: "date" })
  periodKey: string;

  @Column({ type: "varchar" })
  trigger: ChallengeRotationTrigger;

  @Column({ type: "varchar" })
  status: ChallengeRotationStatus;

  @Column({ name: "requested_count", type: "smallint" })
  requestedCount: number;

  @Column({ name: "selected_count", type: "smallint" })
  selectedCount: number;

  @Column({ name: "selected_challenges", type: "jsonb", default: () => "'[]'::jsonb" })
  selectedChallenges: Array<{
    id: number;
    name: string;
    workType: WorkType;
  }>;

  @Column({ name: "actor_user_id", type: "bigint", nullable: true })
  actorUserId: number | null;

  @Column({ type: "varchar", nullable: true })
  message: string | null;
}

@Entity({ name: "user_progress_challenges", schema: "todo_list" })
@Unique(["userId", "challengeId", "periodType", "periodKey"])
@Unique("uq_user_progress_challenges_assignment", ["userId", "assignmentId"])
export class UserProgressChallenge extends BaseEntity {
  @ManyToOne(() => ChallengeAssignment, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "assignment_id" })
  assignment: ChallengeAssignment | null;

  @Column({ name: "assignment_id", type: "bigint", nullable: true })
  assignmentId: number | null;

  @ManyToOne(() => Challenge, { nullable: false })
  @JoinColumn({ name: "challenges_id" })
  challenge: Challenge;

  @Column({ name: "challenges_id", type: "bigint" })
  challengeId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "period_type", type: "varchar" })
  periodType: PeriodType;

  @Column({ name: "period_key" })
  periodKey: string;

  @Column({ name: "current_count" })
  currentCount: number;

  @Column({ name: "is_achieved" })
  isAchieved: boolean;
}

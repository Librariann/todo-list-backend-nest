import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

@Entity({ name: "habits", schema: "todo_list" })
export class Habit extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;
  @Column({ name: "user_id", type: "bigint" }) userId: number;
  @Column({ length: 50 }) name: string;
  @Column({ type: "varchar", nullable: true, length: 255 }) description:
    string | null;
  @Column({ name: "daily_target" }) dailyTarget: number;
  @Column({ type: "varchar", nullable: true, length: 20 }) unit: string | null;
  @Column({ name: "is_active", default: true }) isActive: boolean;
}

@Entity({ name: "habit_logs", schema: "todo_list" })
@Unique(["habitId", "logDate"])
export class HabitLog extends BaseEntity {
  @ManyToOne(() => Habit, { nullable: false })
  @JoinColumn({ name: "habit_id" })
  habit: Habit;
  @Column({ name: "habit_id", type: "bigint" }) habitId: number;
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;
  @Column({ name: "user_id", type: "bigint" }) userId: number;
  @Column({ name: "log_date", type: "date" }) logDate: string;
  @Column({ name: "current_count", default: 0 }) currentCount: number;
  @Column({ name: "is_achieved", default: false }) isAchieved: boolean;
}

@Entity({ name: "habit_streaks", schema: "todo_list" })
export class HabitStreak extends BaseEntity {
  @ManyToOne(() => Habit, { nullable: false })
  @JoinColumn({ name: "habit_id" })
  habit: Habit;
  @Column({ name: "habit_id", type: "bigint" }) habitId: number;
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;
  @Column({ name: "user_id", type: "bigint" }) userId: number;
  @Column({ name: "current_streak", default: 0 }) currentStreak: number;
  @Column({ name: "longest_streak", default: 0 }) longestStreak: number;
}

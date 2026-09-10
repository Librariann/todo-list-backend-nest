import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

@Entity({ name: "notification_preferences", schema: "todo_list" })
@Index("uq_notification_preferences_user", ["userId"], { unique: true })
@Index("idx_notification_preferences_due", ["pushEnabled", "nextReminderAt"])
export class NotificationPreference extends BaseEntity {
  @OneToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint", unique: true })
  userId: number;

  @Column({ name: "push_enabled", default: true })
  pushEnabled: boolean;

  @Column({
    name: "daily_reminder_time",
    type: "varchar",
    length: 5,
    default: "09:00",
  })
  dailyReminderTime: string;

  @Column({ type: "varchar", length: 64, default: "Asia/Seoul" })
  timezone: string;

  @Column({
    name: "next_reminder_at",
    type: "timestamptz",
    nullable: true,
  })
  nextReminderAt: Date | null;
}

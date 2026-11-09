import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export enum TodoStatus {
  READY = "READY",
  PROCESS = "PROCESS",
  DONE = "DONE",
}
@Entity({ name: "todos", schema: "todo_list" })
@Index("idx_todos_pending_reminders", ["reminderAt"], {
  where: "reminder_at IS NOT NULL",
})
@Index("uq_todos_repeat_date", ["repeatSeriesId", "targetDate"], { unique: true })
@Index("uq_todos_active_repeat", ["repeatSeriesId"], {
  unique: true,
  where: "repeat_daily",
})
@Index("idx_todos_active_repeat_dates", ["targetDate", "userId"], {
  where: "repeat_daily",
})
export class Todo extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ type: "varchar", default: TodoStatus.READY })
  status: TodoStatus;

  @Column({ name: "order_index", default: 1 })
  orderIndex: number;

  @Column({ name: "target_date", type: "date" })
  targetDate: string;

  @Column({ name: "reminder_at", type: "timestamptz", nullable: true })
  reminderAt: Date | null;

  @Column({ name: "reminder_time", type: "varchar", length: 5, nullable: true })
  reminderTime: string | null;

  @Column({ name: "repeat_series_id", type: "uuid", nullable: true })
  repeatSeriesId: string | null;

  @Column({ name: "repeat_daily", default: false })
  repeatDaily: boolean;
}

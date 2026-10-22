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
}

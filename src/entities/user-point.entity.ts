import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { PeriodType } from "../common/date";
import { User } from "./user.entity";

export enum PointAction {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
}
export enum PointReason {
  CHALLENGE = "CHALLENGE",
  SPEND = "SPEND",
  EXPIRE = "EXPIRE",
  ADJUST = "ADJUST",
}
export enum PointMetaType {
  CHALLENGE = "CHALLENGE",
  STORE = "STORE",
  ADMIN = "ADMIN",
  NONE = "NONE",
}
@Entity({ name: "user_points", schema: "todo_list" })
export class UserPoint extends BaseEntity {
  @Column({ type: "varchar", default: PointAction.CREDIT })
  action: PointAction;

  @Column({ type: "varchar", default: PointReason.CHALLENGE })
  reason: PointReason;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "meta_type", type: "varchar", nullable: true })
  metaType: PointMetaType | null;

  @Column({ name: "meta_id", type: "bigint", nullable: true })
  metaId: number | null;

  @Column({ name: "period_type", type: "varchar", nullable: true })
  periodType: PeriodType | null;

  @Column({ name: "period_key", type: "varchar", nullable: true })
  periodKey: string | null;

  @Column()
  point: number;
}

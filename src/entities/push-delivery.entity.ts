import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { PushDevice } from "./push-device.entity";

export enum PushDeliveryStatus {
  PENDING = "PENDING",
  DELIVERED = "DELIVERED",
  ERROR = "ERROR",
  EXPIRED = "EXPIRED",
}

@Entity({ name: "push_deliveries", schema: "todo_list" })
@Index("idx_push_deliveries_pending", ["status", "nextReceiptCheckAt"])
export class PushDelivery extends BaseEntity {
  @ManyToOne(() => PushDevice, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "push_device_id" })
  device: PushDevice;

  @Column({ name: "push_device_id", type: "bigint" })
  pushDeviceId: number;

  @Column({ name: "receipt_id", type: "varchar", length: 255, unique: true })
  receiptId: string;

  @Column({ name: "notification_type", type: "varchar", length: 50 })
  notificationType: string;

  @Column({ type: "varchar", length: 20, default: PushDeliveryStatus.PENDING })
  status: PushDeliveryStatus;

  @Column({ name: "error_code", type: "varchar", length: 100, nullable: true })
  errorCode: string | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "receipt_check_attempts", type: "int", default: 0 })
  receiptCheckAttempts: number;

  @Column({ name: "next_receipt_check_at", type: "timestamp" })
  nextReceiptCheckAt: Date;

  @Column({ name: "checked_at", type: "timestamp", nullable: true })
  checkedAt: Date | null;
}

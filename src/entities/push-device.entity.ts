import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export enum PushProvider {
  EXPO = "EXPO",
}

export enum MobilePlatform {
  IOS = "IOS",
  ANDROID = "ANDROID",
}

@Entity({ name: "push_devices", schema: "todo_list" })
@Index("idx_push_devices_user_enabled", ["userId", "enabled"])
export class PushDevice extends BaseEntity {
  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "installation_id", length: 128, unique: true })
  installationId: string;

  @Column({ length: 512, unique: true })
  token: string;

  @Column({ type: "varchar", length: 20 })
  provider: PushProvider;

  @Column({ type: "varchar", length: 20 })
  platform: MobilePlatform;

  @Column({
    name: "device_model",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  deviceModel: string | null;

  @Column({ name: "os_version", type: "varchar", length: 50, nullable: true })
  osVersion: string | null;

  @Column({ name: "app_version", type: "varchar", length: 50, nullable: true })
  appVersion: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  timezone: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: "last_registered_at", type: "timestamp" })
  lastRegisteredAt: Date;
}

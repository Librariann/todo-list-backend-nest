import { Column, Entity } from "typeorm";
import { BaseEntity } from "./base.entity";

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  WITHDRAWN = "WITHDRAWN",
}
export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

@Entity({ name: "users", schema: "todo_list" })
export class User extends BaseEntity {
  @Column({ unique: true, length: 50 })
  nickname: string;

  @Column({ unique: true, length: 100 })
  email: string;

  @Column()
  password: string;

  @Column({ type: "varchar", nullable: true, length: 50 })
  name: string | null;

  @Column({ name: "phone_number", type: "varchar", nullable: true, length: 20 })
  phoneNumber: string | null;

  @Column({ type: "varchar", nullable: true, length: 20 })
  provider: string | null;

  @Column({ name: "provider_id", type: "varchar", nullable: true, length: 255 })
  providerId: string | null;

  @Column({ type: "varchar", default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: "varchar", default: UserRole.USER })
  role: UserRole;
}

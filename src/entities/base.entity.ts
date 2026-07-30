import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" }) id: number;
  @CreateDateColumn({ name: "created_at", type: "timestamp" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamp" }) updatedAt: Date;
}

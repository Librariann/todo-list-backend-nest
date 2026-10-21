import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import type {
  RecommendationPayload,
  RecommendationType,
} from "../recommendations/recommendation.types";

export enum RecommendationStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  DISMISSED = "DISMISSED",
}

@Entity({ name: "ai_recommendations", schema: "todo_list" })
@Index("idx_ai_recommendations_user_generation", ["userId", "generationId"])
export class Recommendation extends BaseEntity {
  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "generation_id", type: "uuid" })
  generationId: string;

  @Column({ type: "varchar", length: 10 })
  type: RecommendationType;

  @Column({ length: 50 })
  title: string;

  @Column({ length: 300 })
  reason: string;

  @Column({ type: "jsonb" })
  payload: RecommendationPayload;

  @Column({ name: "source_ids", type: "jsonb" })
  sourceIds: string[];

  @Column({ type: "varchar", default: RecommendationStatus.PENDING })
  status: RecommendationStatus;

  @Column({ name: "created_item_id", type: "bigint", nullable: true })
  createdItemId: number | null;
}

// A per-user row provides a persistent inference budget and a cross-process lease.
@Entity({ name: "ai_recommendation_states", schema: "todo_list" })
@Index("uq_ai_recommendation_states_user", ["userId"], { unique: true })
export class RecommendationState extends BaseEntity {
  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "generation_date", type: "date", nullable: true })
  generationDate: string | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: "last_attempt_at", type: "timestamptz", nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: "lease_until", type: "timestamptz", nullable: true })
  leaseUntil: Date | null;

  @Column({ name: "lease_token", type: "uuid", nullable: true })
  leaseToken: string | null;

  @Column({ name: "latest_generation_id", type: "uuid", nullable: true })
  latestGenerationId: string | null;
}

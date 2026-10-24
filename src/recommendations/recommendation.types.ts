import type { PeriodType } from "../common/date";
import type { RecommendationStatus } from "../entities/recommendation.entity";

export type RecommendationType = "todo" | "habit" | "goal";

export interface RecommendationPayload {
  targetDate?: string;
  dailyTarget?: number;
  unit?: string;
  recurrenceType?: PeriodType;
  interval?: number;
  startDate?: string;
  targetCount?: number;
}

export interface RecommendationOutput {
  id: number;
  type: RecommendationType;
  title: string;
  reason: string;
  status: RecommendationStatus;
  payload: RecommendationPayload;
  createdItemId: number | null;
  createdAt: Date;
}

export interface RecommendationList {
  available: boolean;
  items: RecommendationOutput[];
  message: string | null;
  retryAfterSeconds: number;
}

export interface ContextSource {
  sourceId: string;
  type: RecommendationType;
  title: string;
  facts: Record<string, number | string | boolean | null>;
}

export interface RecommendationContext {
  today: string;
  from: string;
  sources: ContextSource[];
  recentFeedback: {
    type: RecommendationType;
    title: string;
    status: RecommendationStatus;
  }[];
}

export interface ValidRecommendation {
  type: RecommendationType;
  title: string;
  reason: string;
  payload: RecommendationPayload;
  sourceIds: string[];
}

import { BadGatewayException } from "@nestjs/common";
import { isValidDateString, PeriodType } from "../common/date";
import type {
  RecommendationContext,
  RecommendationType,
  ValidRecommendation,
} from "./recommendation.types";

export function normalizeRecommendationTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[\s\p{P}]+/gu, "")
    .toLocaleLowerCase("ko");
}

function invalid(): never {
  throw new BadGatewayException(
    "추천 내용을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    invalid();
  return value.trim();
}

function count(value: unknown, max = 30): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    invalid();
  return value;
}

function date(value: unknown, today: string): string {
  if (typeof value !== "string" || !isValidDateString(value) || value !== today)
    invalid();
  return value;
}

export function parseRecommendations(
  value: unknown,
  context: RecommendationContext,
): ValidRecommendation[] {
  const data = object(value);
  if (!Array.isArray(data.recommendations) || data.recommendations.length > 3)
    invalid();
  const sources = new Map(
    context.sources.map((source) => [source.sourceId, source]),
  );
  const seen = new Set<string>();

  return data.recommendations.map((raw: unknown) => {
    const item = object(raw);
    if (item.type !== "todo" && item.type !== "habit" && item.type !== "goal")
      invalid();
    const type: RecommendationType = item.type;
    const title = text(item.title, 50);
    if (!/[가-힣]/u.test(title)) invalid();
    if (
      !Array.isArray(item.sourceIds) ||
      item.sourceIds.length < 1 ||
      item.sourceIds.length > 3 ||
      item.sourceIds.some(
        (id: unknown) => typeof id !== "string" || !sources.has(id),
      )
    )
      invalid();
    const sourceIds = [...new Set(item.sourceIds as string[])];
    const duplicateKey = `${type}:${normalizeRecommendationTitle(title)}`;
    if (seen.has(duplicateKey)) invalid();
    seen.add(duplicateKey);
    const settings = object(item.payload);
    let payload: ValidRecommendation["payload"];
    if (type === "todo") {
      payload = { targetDate: date(settings.targetDate, context.today) };
    } else if (type === "habit") {
      payload = {
        dailyTarget: count(settings.dailyTarget),
        unit: text(settings.unit, 20),
      };
    } else {
      if (
        !Object.values(PeriodType).includes(
          settings.recurrenceType as PeriodType,
        )
      )
        invalid();
      payload = {
        recurrenceType: settings.recurrenceType as PeriodType,
        interval: count(settings.interval, 4),
        startDate: date(settings.startDate, context.today),
        targetCount: count(settings.targetCount),
      };
    }

    // Reasons are made from verified source records, not unverifiable model claims.
    const source = sources.get(sourceIds[0])!;
    const label = { todo: "할 일", habit: "습관", goal: "목표" }[source.type];
    const reason = `기록한 ${label} ‘${source.title}’에서 이어갈 수 있는 제안이에요.`;
    return { type, title, reason, payload, sourceIds };
  });
}

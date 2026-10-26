import { BadGatewayException } from "@nestjs/common";
import { parseRecommendations } from "./recommendation-policy";
import type { RecommendationContext } from "./recommendation.types";

const context: RecommendationContext = {
  today: "2026-10-30",
  from: "2026-10-01",
  recentFeedback: [],
  sources: [
    {
      sourceId: "todo:1",
      type: "todo",
      title: "산책하기",
      facts: { status: "DONE" },
    },
  ],
};
const habit = {
  type: "habit",
  title: "가볍게 걷기",
  sourceIds: ["todo:1"],
  payload: { dailyTarget: 1, unit: "회" },
};

describe("recommendation policy", () => {
  it("returns a reason grounded in an actual record, without model-invented metrics", () => {
    const [item] = parseRecommendations(
      { recommendations: [{ ...habit, reason: "100% 성공" }] },
      context,
    );
    expect(item.reason).toContain("산책하기");
    expect(item.reason).not.toContain("100%");
    expect(item.payload).toEqual({ dailyTarget: 1, unit: "회" });
  });

  it.each([
    { recommendations: Array(4).fill(habit) },
    { recommendations: [habit, { ...habit, title: "가볍게  걷기!" }] },
    { recommendations: [{ ...habit, sourceIds: ["todo:other-user"] }] },
    { recommendations: [{ ...habit, sourceIds: [] }] },
    { recommendations: [{ ...habit, title: "walk" }] },
    { recommendations: [{ ...habit, title: "가".repeat(51) }] },
    {
      recommendations: [{ ...habit, payload: { dailyTarget: 0, unit: "회" } }],
    },
    {
      recommendations: [
        { ...habit, payload: { dailyTarget: 1.5, unit: "회" } },
      ],
    },
    {
      recommendations: [
        { ...habit, type: "todo", payload: { targetDate: "2026-10-29" } },
      ],
    },
    {
      recommendations: [
        {
          ...habit,
          type: "goal",
          payload: {
            recurrenceType: "YEARLY",
            startDate: context.today,
            interval: 1,
            targetCount: 3,
          },
        },
      ],
    },
    {
      recommendations: [
        {
          ...habit,
          type: "goal",
          payload: {
            recurrenceType: "WEEKLY",
            startDate: context.today,
            interval: 5,
            targetCount: 3,
          },
        },
      ],
    },
  ])(
    "rejects malformed, ungrounded, excessive or duplicate recommendations %#",
    (value) => {
      expect(() => parseRecommendations(value, context)).toThrow(
        BadGatewayException,
      );
    },
  );
});

import {
  goalPeriodEnd,
  goalPeriodForDate,
  goalPeriodForIndex,
  isValidDateString,
  periodKey,
  PeriodType,
  today,
} from "./date";

describe("goal period calculation", () => {
  it("keeps weekly periods anchored to the goal creation weekday", () => {
    expect(goalPeriodEnd("2026-08-20", PeriodType.WEEKLY)).toBe("2026-08-26");
    expect(
      goalPeriodForDate("2026-08-20", PeriodType.WEEKLY, 1, "2026-08-27"),
    ).toEqual({ index: 2, start: "2026-08-27", end: "2026-09-02" });
  });

  it("supports multi-week intervals without changing the anchor weekday", () => {
    expect(goalPeriodForIndex("2026-08-20", PeriodType.WEEKLY, 2, 2)).toEqual({
      index: 2,
      start: "2026-09-03",
      end: "2026-09-16",
    });
  });

  it("keeps monthly periods anchored to the goal creation date", () => {
    expect(goalPeriodEnd("2026-08-20", PeriodType.MONTHLY)).toBe("2026-09-19");
    expect(
      goalPeriodForDate("2026-08-20", PeriodType.MONTHLY, 1, "2026-09-20"),
    ).toEqual({ index: 2, start: "2026-09-20", end: "2026-10-19" });
  });

  it("keeps month-end periods continuous when the anchor day is unavailable", () => {
    expect(goalPeriodForIndex("2026-01-31", PeriodType.MONTHLY, 1, 1)).toEqual({
      index: 1,
      start: "2026-01-31",
      end: "2026-02-27",
    });
    expect(goalPeriodForIndex("2026-01-31", PeriodType.MONTHLY, 1, 2)).toEqual({
      index: 2,
      start: "2026-02-28",
      end: "2026-03-30",
    });
    expect(
      goalPeriodForDate("2026-01-31", PeriodType.MONTHLY, 1, "2026-03-01"),
    ).toEqual({ index: 2, start: "2026-02-28", end: "2026-03-30" });
  });

  it("rejects malformed or impossible calendar dates", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-08-22")).toBe(true);
  });
});

describe("challenge rotation period boundaries", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("switches the daily key at midnight in Asia/Seoul", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-27T14:59:59Z"));
    expect(today()).toBe("2026-08-27");

    jest.setSystemTime(new Date("2026-08-27T15:00:00Z"));
    expect(today()).toBe("2026-08-28");
  });

  it("keeps Sunday in the previous weekly period and starts Monday anew", () => {
    expect(periodKey(PeriodType.WEEKLY, "2026-08-30")).toBe("2026-08-24");
    expect(periodKey(PeriodType.WEEKLY, "2026-08-31")).toBe("2026-08-31");
  });

  it("switches monthly periods on the first day of the month", () => {
    expect(periodKey(PeriodType.MONTHLY, "2026-08-31")).toBe("2026-08-01");
    expect(periodKey(PeriodType.MONTHLY, "2026-09-01")).toBe("2026-09-01");
  });

  it("handles weekly and monthly boundaries across a year", () => {
    expect(periodKey(PeriodType.WEEKLY, "2027-01-03")).toBe("2026-12-28");
    expect(periodKey(PeriodType.WEEKLY, "2027-01-04")).toBe("2027-01-04");
    expect(periodKey(PeriodType.MONTHLY, "2027-01-01")).toBe("2027-01-01");
  });
});

import { addPeriod, periodKey, PeriodType } from "./date";

describe("date helpers", () => {
  it("calculates compatible period end dates", () => {
    expect(addPeriod("2026-08-05", PeriodType.DAILY, 1)).toBe("2026-08-05");
    expect(addPeriod("2026-08-05", PeriodType.WEEKLY, 1)).toBe("2026-08-11");
    expect(addPeriod("2026-01-31", PeriodType.MONTHLY, 1)).toBe("2026-02-27");
  });

  it("uses Monday and month start as period keys", () => {
    expect(periodKey(PeriodType.DAILY, "2026-08-05")).toBe("2026-08-05");
    expect(periodKey(PeriodType.WEEKLY, "2026-08-05")).toBe("2026-08-03");
    expect(periodKey(PeriodType.MONTHLY, "2026-08-05")).toBe("2026-08-01");
  });
});

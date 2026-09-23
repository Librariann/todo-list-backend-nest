import { describe, expect, it } from "@jest/globals";
import { redactCouponTelemetry } from "./coupon-telemetry";

describe("redactCouponTelemetry", () => {
  it("removes the entire upload body but preserves unrelated error context", () => {
    const result = redactCouponTelemetry({
      request: {
        url: "https://api.example.com/api/admin/rewards/3/coupons",
        data: "raw multipart PIN and image",
      },
      tags: { requestId: "safe-id" },
      exception: { values: [{ type: "DatabaseError" }] },
    });
    expect(result.request.data).toBe("[REDACTED]");
    expect(result.tags.requestId).toBe("safe-id");
    expect(result.exception.values[0].type).toBe("DatabaseError");
  });

  it("recursively redacts named secrets in nested event data and arrays", () => {
    const result = redactCouponTelemetry({
      request: {
        url: "/api/user/rewards",
        data: { nested: [{ couponCode: "raw-pin", safe: true }] },
      },
      extra: {
        pinCode: "raw",
        encryptedPin: "sealed",
        pinHash: "hash",
        COUPON_SECRET_KEY: "key",
      },
    });
    expect(result.request.data.nested[0]).toEqual({
      couponCode: "[REDACTED]",
      safe: true,
    });
    expect(Object.values(result.extra)).toEqual(Array(4).fill("[REDACTED]"));
  });

  it("leaves unrelated requests alone and tolerates cyclic context", () => {
    const extra: Record<string, unknown> = {};
    extra.self = extra;
    const result = redactCouponTelemetry({
      request: { url: "/api/todos", data: { title: "할 일" } },
      extra,
    });
    expect(result.request.data).toEqual({ title: "할 일" });
    expect(result.extra.self).toBe(extra);
  });
});

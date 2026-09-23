interface CouponTelemetryEvent {
  request?: { url?: string; data?: unknown };
}

const SECRET_FIELD =
  /^(pinCode|encryptedPin|couponCode|pinHash|imageObjectKey|COUPON_SECRET_KEY)$/i;
const COUPON_ADMIN_PATH = /\/api\/admin\/rewards\/[^/]+\/coupons(?:[/?]|$)/;

/** Keep coupon credentials and multipart image bodies out of error telemetry. */
export function redactCouponTelemetry<T extends CouponTelemetryEvent>(
  event: T,
): T {
  if (event.request?.url && COUPON_ADMIN_PATH.test(event.request.url)) {
    event.request.data = "[REDACTED]";
  }
  const seen = new WeakSet<object>();
  function redact(value: unknown): void {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_FIELD.test(key)) {
        (value as Record<string, unknown>)[key] = "[REDACTED]";
      } else {
        redact(child);
      }
    }
  }
  redact(event);
  return event;
}

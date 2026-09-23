import { describe, expect, it } from "@jest/globals";
import { ConfigService } from "@nestjs/config";
import { CouponCryptoService } from "./coupon-crypto.service";

const secret = Buffer.alloc(32, 7).toString("base64");

describe("CouponCryptoService", () => {
  const service = new CouponCryptoService(
    new ConfigService({ COUPON_SECRET_KEY: secret }),
  );

  it("normalizes PINs, uses random authenticated encryption, and hashes duplicates consistently", () => {
    const first = service.seal("1234-5678 9012");
    const second = service.seal("123456789012");
    expect(first.pinHash).toBe(second.pinHash);
    expect(first.encryptedPin).not.toBe(second.encryptedPin);
    expect(first.encryptedPin).not.toContain("123456789012");
    expect(first.pinLastFour).toBe("9012");
    expect(service.open(first.encryptedPin)).toBe("123456789012");
  });

  it("rejects tampered ciphertext without exposing the PIN", () => {
    const encrypted = service.seal("123456789012").encryptedPin.split(":");
    encrypted[3] = Buffer.alloc(12, 0).toString("base64");
    expect(() => service.open(encrypted.join(":"))).toThrow(
      "쿠폰 정보를 복호화할 수 없습니다.",
    );
  });

  it.each([undefined, "", "short", Buffer.alloc(31).toString("base64")])(
    "validates missing or invalid secret at use time",
    (key) => {
      const invalid = new CouponCryptoService(
        new ConfigService({ COUPON_SECRET_KEY: key }),
      );
      expect(() => invalid.seal("123456789012")).toThrow("쿠폰 암호화 설정");
    },
  );

  it.each(["123", "1234567X", "<script>12345678", "1".repeat(65)])(
    "rejects malformed PIN %s",
    (pin) => {
      expect(() => service.seal(pin)).toThrow("쿠폰 번호");
    },
  );
});

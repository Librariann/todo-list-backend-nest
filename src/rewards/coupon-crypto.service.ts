import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";

@Injectable()
export class CouponCryptoService {
  constructor(private readonly config: ConfigService) {}

  normalize(pin: string): string {
    const normalized = pin.replace(/[\s-]/g, "");
    if (!/^\d{8,64}$/.test(normalized)) {
      throw new BadRequestException(
        "쿠폰 번호는 공백과 하이픈을 제외한 8~64자리 숫자여야 합니다.",
      );
    }
    return normalized;
  }

  seal(pin: string): {
    encryptedPin: string;
    pinHash: string;
    pinLastFour: string;
  } {
    const normalized = this.normalize(pin);
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(normalized, "utf8"),
      cipher.final(),
    ]);
    return {
      encryptedPin: [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64"),
      ].join(":"),
      pinHash: createHmac("sha256", key)
        .update(`reward-coupon-pin:${normalized}`)
        .digest("hex"),
      pinLastFour: normalized.slice(-4),
    };
  }

  open(encryptedPin: string): string {
    const key = this.key();
    try {
      const [version, iv, tag, encrypted] = encryptedPin.split(":");
      if (version !== "v1" || !iv || !tag || !encrypted)
        throw new Error("invalid envelope");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ServiceUnavailableException(
        "쿠폰 정보를 복호화할 수 없습니다. 관리자에게 문의해 주세요.",
      );
    }
  }

  private key(): Buffer {
    const configured = this.config.get<string>("COUPON_SECRET_KEY") ?? "";
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32 || key.toString("base64") !== configured) {
      throw new ServiceUnavailableException(
        "쿠폰 암호화 설정을 확인해 주세요.",
      );
    }
    return key;
  }
}

import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CouponStorageService {
  constructor(private readonly config: ConfigService) {}

  async upload(body: Buffer, contentType: string): Promise<string> {
    const uploadApiKey = this.uploadApiKey();
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(body)], { type: contentType }),
      `coupon.${this.extension(contentType)}`,
    );

    try {
      const response = await fetch(this.uploadUrl(), {
        method: "POST",
        headers: {
          "x-growdo-upload-key": uploadApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      const result = (await response.json().catch(() => null)) as {
        fileName?: unknown;
      } | null;
      if (!response.ok || typeof result?.fileName !== "string") {
        throw new Error("invalid upload response");
      }
      return this.validateObjectKey(result.fileName);
    } catch {
      throw new ServiceUnavailableException(
        "쿠폰 이미지 업로드 서버를 사용할 수 없습니다.",
      );
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const response = await fetch(this.objectUrl(key), {
        method: "DELETE",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("delete failed");
    } catch {
      throw new ServiceUnavailableException("쿠폰 이미지 정리가 필요합니다.");
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      const response = await fetch(this.objectUrl(key), {
        method: "GET",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("read failed");
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw new ServiceUnavailableException(
        "쿠폰 이미지를 불러올 수 없습니다.",
      );
    }
  }

  private uploadUrl(): string {
    return (
      this.config.get<string>("COUPON_UPLOAD_URL") ??
      "https://upload-server-upload.up.railway.app/api/upload/growdo/coupon"
    );
  }

  private objectUrl(key: string): string {
    return `${this.uploadUrl().replace(/\/$/, "")}/${encodeURIComponent(
      this.validateObjectKey(key),
    )}`;
  }

  private authHeaders(): Record<string, string> {
    return { "x-growdo-upload-key": this.uploadApiKey() };
  }

  private uploadApiKey(): string {
    const apiKey = this.config.get<string>("GROWDO_UPLOAD_API_KEY")?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "쿠폰 이미지 업로드 인증 설정을 확인해 주세요.",
      );
    }
    return apiKey;
  }

  private extension(contentType: string): string {
    if (contentType === "image/png") return "png";
    if (contentType === "image/webp") return "webp";
    return "jpg";
  }

  private validateObjectKey(value: string): string {
    const key = value.trim();
    if (
      !key ||
      key.length > 300 ||
      key.includes("/") ||
      key.includes("\\") ||
      key.includes("..")
    ) {
      throw new Error("invalid coupon object key");
    }
    return key;
  }
}

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceUnavailableException } from "@nestjs/common";
import { CouponStorageService } from "./coupon-storage.service";

const uploadUrl = "https://uploads.example.com/api/upload/growdo/coupon";
const uploadApiKey = "shared-upload-secret";

function service(apiKey: string | null = uploadApiKey): CouponStorageService {
  return new CouponStorageService({
    get: jest.fn((key: string) => {
      if (key === "COUPON_UPLOAD_URL") return uploadUrl;
      if (key === "GROWDO_UPLOAD_API_KEY") return apiKey ?? undefined;
      return undefined;
    }),
  } as never);
}

describe("CouponStorageService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uploads through the existing private coupon endpoint and returns its fileName", async () => {
    const request = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fileName: "generated-coupon.png" }),
    } as Response);

    await expect(
      service().upload(Buffer.from("image"), "image/png"),
    ).resolves.toBe("generated-coupon.png");

    expect(request).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        method: "POST",
        headers: { "x-growdo-upload-key": uploadApiKey },
        body: expect.any(FormData),
      }),
    );
  });

  it("does not contact the upload server without the shared API key", async () => {
    const request = jest.spyOn(global, "fetch");

    await expect(
      service(null).upload(Buffer.from("image"), "image/png"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, body: { error: "failed" } },
    { ok: true, body: {} },
    { ok: true, body: { fileName: "../unsafe.png" } },
  ])("rejects unusable upload responses (case %#)", async ({ ok, body }) => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    } as Response);

    await expect(
      service().upload(Buffer.from("image"), "image/png"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reads a private coupon through the upload server", async () => {
    const request = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Uint8Array.from([1, 2, 3]).buffer),
    } as Response);

    await expect(service().read("generated-coupon.png")).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(request).toHaveBeenCalledWith(
      `${uploadUrl}/generated-coupon.png`,
      expect.objectContaining({
        method: "GET",
        headers: { "x-growdo-upload-key": uploadApiKey },
      }),
    );
  });

  it("deletes a private coupon through the upload server", async () => {
    const request = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
    } as Response);

    await expect(
      service().remove("generated coupon.png"),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      `${uploadUrl}/generated%20coupon.png`,
      expect.objectContaining({
        method: "DELETE",
        headers: { "x-growdo-upload-key": uploadApiKey },
      }),
    );
  });

  it.each(["read", "remove"] as const)(
    "rejects %s when the upload server is unavailable",
    async (operation) => {
      jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);

      await expect(
        operation === "read"
          ? service().read("generated-coupon.png")
          : service().remove("generated-coupon.png"),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );
});

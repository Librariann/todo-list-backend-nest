import { describe, expect, it, jest } from "@jest/globals";
import {
  PushDeliveryStatus,
  type PushDelivery,
} from "../entities/push-delivery.entity";
import {
  MobilePlatform,
  PushProvider,
  type PushDevice,
} from "../entities/push-device.entity";
import { PushService } from "./push.service";

function createService(
  deviceRepository: Record<string, unknown>,
  deliveryRepository: Record<string, unknown> = {},
): PushService {
  return new PushService(
    deviceRepository as never,
    deliveryRepository as never,
    { get: jest.fn(() => undefined) } as never,
  );
}

describe("PushService", () => {
  it("registers a device for the current user", async () => {
    const repository = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(() => ({})),
      save: jest.fn((device: object) => Promise.resolve({ id: 1, ...device })),
    };
    const service = createService(repository);

    const result = await service.register(7, {
      installationId: "4b27c123-9080-4a7c-8bb7-f988456d9012",
      token: "ExponentPushToken[test-token]",
      provider: PushProvider.EXPO,
      platform: MobilePlatform.IOS,
      timezone: "Asia/Seoul",
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, enabled: true }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 1, installationId: expect.any(String) }),
    );
  });

  it("disables the current user's device on logout", async () => {
    const device = { enabled: true };
    const repository = {
      findOne: jest.fn(() => Promise.resolve(device)),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const service = createService(repository);

    await service.unregister(7, "installation-1234");

    expect(device.enabled).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(device);
  });

  it("sends to all active devices and stores Expo receipt ids", async () => {
    const devices = [
      {
        id: 11,
        token: "ExponentPushToken[first]",
        enabled: true,
        provider: PushProvider.EXPO,
      },
      {
        id: 12,
        token: "ExponentPushToken[second]",
        enabled: true,
        provider: PushProvider.EXPO,
      },
    ] as PushDevice[];
    const deviceRepository = {
      find: jest.fn(() => Promise.resolve(devices)),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const deliveryRepository = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { status: "ok", id: "receipt-1" },
            { status: "ok", id: "receipt-2" },
          ],
        }),
    } as Response);
    const service = createService(deviceRepository, deliveryRepository);

    const result = await service.sendToUser(7, {
      title: "제목",
      body: "내용",
      type: "TEST",
    });

    expect(result).toEqual({ targetedDevices: 2, accepted: 2, failed: 0 });
    expect(deliveryRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        pushDeviceId: 11,
        receiptId: "receipt-1",
        status: PushDeliveryStatus.PENDING,
      }),
      expect.objectContaining({
        pushDeviceId: 12,
        receiptId: "receipt-2",
        status: PushDeliveryStatus.PENDING,
      }),
    ]);
    fetchSpy.mockRestore();
  });

  it("disables a device rejected as DeviceNotRegistered", async () => {
    const device = {
      id: 11,
      token: "ExponentPushToken[expired]",
      enabled: true,
      provider: PushProvider.EXPO,
    } as PushDevice;
    const deviceRepository = {
      find: jest.fn(() => Promise.resolve([device])),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const deliveryRepository = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              status: "error",
              message: "Device is not registered",
              details: { error: "DeviceNotRegistered" },
            },
          ],
        }),
    } as Response);
    const service = createService(deviceRepository, deliveryRepository);

    const result = await service.sendToUser(7, {
      title: "제목",
      body: "내용",
      type: "TEST",
    });

    expect(result).toEqual({ targetedDevices: 1, accepted: 0, failed: 1 });
    expect(device.enabled).toBe(false);
    expect(deviceRepository.save).toHaveBeenCalledWith([device]);
    fetchSpy.mockRestore();
  });

  it("marks successful receipts as delivered", async () => {
    const device = { id: 11, enabled: true } as PushDevice;
    const delivery = {
      receiptId: "receipt-1",
      status: PushDeliveryStatus.PENDING,
      receiptCheckAttempts: 0,
      device,
    } as PushDelivery;
    const deviceRepository = {
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const deliveryRepository = {
      find: jest.fn(() => Promise.resolve([delivery])),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { "receipt-1": { status: "ok" } },
        }),
    } as Response);
    const service = createService(deviceRepository, deliveryRepository);

    await service.checkPendingReceipts();

    expect(delivery.status).toBe(PushDeliveryStatus.DELIVERED);
    expect(delivery.receiptCheckAttempts).toBe(1);
    expect(delivery.checkedAt).toBeInstanceOf(Date);
    fetchSpy.mockRestore();
  });
});

import { describe, expect, it, jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponProvider,
  RewardCoupon,
  RewardCouponStatus,
} from "../entities/reward-coupon.entity";
import { Reward, RewardType } from "../entities/reward.entity";
import {
  CouponImageUpload,
  RewardCouponsService,
} from "./reward-coupons.service";

function coupon(overrides: Partial<RewardCoupon> = {}): RewardCoupon {
  return {
    id: 12,
    rewardId: 3,
    provider: CouponProvider.GIFTISHOW,
    providerOrderNumber: null,
    encryptedPin: "sealed",
    pinHash: "hash",
    pinLastFour: "9012",
    imageObjectKey: "private/secret-image",
    imageContentType: "image/png",
    expiresAt: new Date("2099-01-01"),
    status: RewardCouponStatus.AVAILABLE,
    assignedUserId: null,
    userRewardId: null,
    assignedAt: null,
    usedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RewardCoupon;
}

const image: CouponImageUpload = {
  buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  mimetype: "image/png",
  size: 8,
};
const dto = {
  pinCode: "123456789012",
  expiresAt: "2099-01-01",
  providerOrderNumber: "order-1",
};

function setup(value = coupon()) {
  const query = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve<RewardCoupon | null>(value)),
    getRawMany: jest.fn(() => Promise.resolve([{ rewardId: "3", count: "2" }])),
  };
  const coupons = {
    find: jest.fn(() => Promise.resolve([value])),
    findOne: jest.fn(() => Promise.resolve<RewardCoupon | null>(value)),
    findOneByOrFail: jest.fn(() => Promise.resolve(value)),
    exists: jest.fn(() => Promise.resolve(false)),
    create: jest.fn((values: Partial<RewardCoupon>) => ({
      ...value,
      ...values,
    })),
    save: jest.fn((saved: RewardCoupon) => Promise.resolve(saved)),
    update: jest.fn((_where: unknown, changes: Partial<RewardCoupon>) => {
      Object.assign(value, changes);
      return Promise.resolve({ affected: 1 });
    }),
    createQueryBuilder: jest.fn(() => query),
  };
  const rewards = {
    findOneBy: jest.fn(() =>
      Promise.resolve({ id: 3, type: RewardType.COUPON }),
    ),
    findOne: jest.fn(() => Promise.resolve({ id: 3, type: RewardType.COUPON })),
  };
  const owned = {
    findOneBy: jest.fn(() =>
      Promise.resolve<object | null>({ id: 8, userId: 1 }),
    ),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Reward ? rewards : coupons,
    ),
  };
  const dataSource = {
    transaction: jest.fn((work: (value: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const crypto = {
    seal: jest.fn(() => ({
      encryptedPin: "sealed",
      pinHash: "hash",
      pinLastFour: "9012",
    })),
    open: jest.fn(() => "123456789012"),
  };
  const storage = {
    upload: jest.fn((_body: Buffer, _contentType: string) =>
      Promise.resolve("uploaded-coupon.png"),
    ),
    remove: jest.fn(() => Promise.resolve()),
    read: jest.fn(() => Promise.resolve(image.buffer)),
  };
  const service = new RewardCouponsService(
    coupons as never,
    rewards as never,
    owned as never,
    dataSource as never,
    crypto as never,
    storage as never,
  );
  return {
    service,
    coupons,
    rewards,
    owned,
    manager,
    dataSource,
    crypto,
    storage,
    query,
  };
}

describe("RewardCouponsService", () => {
  it("returns masked inventory only and presents expired rows as EXPIRED", async () => {
    const { service, crypto } = setup(
      coupon({ expiresAt: new Date("2020-01-01") }),
    );
    const result = await service.list(3);
    expect(result[0].maskedPin).toBe("****-****-9012");
    expect(result[0].status).toBe(RewardCouponStatus.EXPIRED);
    expect(result[0]).not.toHaveProperty("encryptedPin");
    expect(result[0]).not.toHaveProperty("pinHash");
    expect(result[0]).not.toHaveProperty("imageObjectKey");
    expect(result[0]).not.toHaveProperty("couponCode");
    expect(crypto.open).not.toHaveBeenCalled();
  });

  it("stores encrypted PIN and private image, with inclusive Korean date expiry", async () => {
    const { service, coupons, storage } = setup();
    const result = await service.create(3, dto, image);
    expect(storage.upload).toHaveBeenCalledWith(
      image.buffer,
      "image/png",
    );
    expect(coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedPin: "sealed",
        pinHash: "hash",
        imageObjectKey: "uploaded-coupon.png",
        expiresAt: new Date("2099-01-01T23:59:59.999+09:00"),
      }),
    );
    expect(result).not.toHaveProperty("pinCode");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("rejects duplicate PIN before uploading", async () => {
    const { service, coupons, storage } = setup();
    coupons.exists.mockResolvedValue(true);
    await expect(service.create(3, dto, image)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("cleans up the uploaded object if a concurrent duplicate wins the unique constraint", async () => {
    const { service, coupons, storage } = setup();
    coupons.save.mockRejectedValue({
      code: "23505",
      detail: "sensitive database parameters",
    });
    await expect(service.create(3, dto, image)).rejects.toThrow(
      "이미 등록된 쿠폰 번호",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "uploaded-coupon.png",
    );
  });

  it("sanitizes other database errors and removes orphan images", async () => {
    const { service, coupons, storage } = setup();
    coupons.save.mockRejectedValue(new Error("secret sql details"));
    await expect(service.create(3, dto, image)).rejects.toThrow(
      "쿠폰 등록에 실패했습니다.",
    );
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    { file: undefined },
    { file: { ...image, mimetype: "text/html" } },
    { file: { ...image, buffer: Buffer.from("fake png") } },
    { file: { ...image, size: 10 * 1024 * 1024 + 1 } },
  ])("rejects unsafe upload before S3 (case %#)", async ({ file }) => {
    const { service, storage } = setup();
    await expect(service.create(3, dto, file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects expired uploads", async () => {
    const { service, storage } = setup();
    await expect(
      service.create(3, { ...dto, expiresAt: "2020-01-01" }, image),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("counts only AVAILABLE, unexpired, unassigned inventory", async () => {
    const { service, query } = setup();
    await expect(service.availableCounts([3])).resolves.toEqual(
      new Map([[3, 2]]),
    );
    expect(query.andWhere).toHaveBeenCalledWith("coupon.status = :status", {
      status: RewardCouponStatus.AVAILABLE,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      "coupon.expiresAt > CURRENT_TIMESTAMP",
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "coupon.assignedUserId IS NULL AND coupon.userRewardId IS NULL",
    );
  });

  it("reserves one locked coupon, earliest expiry with randomized ties, skipping other reservations", async () => {
    const { service, manager, query } = setup();
    await service.reserve(manager as never, 3);
    expect(query.where).toHaveBeenCalledWith("coupon.rewardId = :rewardId", {
      rewardId: 3,
    });
    expect(query.orderBy).toHaveBeenCalledWith("coupon.expiresAt", "ASC");
    expect(query.addOrderBy).toHaveBeenCalledWith("RANDOM()");
    expect(query.setLock).toHaveBeenCalledWith("pessimistic_write");
    expect(query.setOnLocked).toHaveBeenCalledWith("skip_locked");
    expect(query.take).toHaveBeenCalledWith(1);
  });

  it("fails when all matching inventory is unavailable or locked", async () => {
    const { service, manager, query } = setup();
    query.getOne.mockResolvedValue(null);
    await expect(service.reserve(manager as never, 3)).rejects.toThrow(
      "준비된 쿠폰이 모두 소진",
    );
  });

  it("assigns once to the owner and guards against a second assignment", async () => {
    const { service, manager, coupons } = setup();
    const result = await service.assign(manager as never, coupon(), 1, 8);
    expect(coupons.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, status: RewardCouponStatus.AVAILABLE }),
      expect.objectContaining({
        status: RewardCouponStatus.ASSIGNED,
        assignedUserId: 1,
        userRewardId: 8,
      }),
    );
    expect(result).toMatchObject({
      couponCode: "123456789012",
      couponImageUrl: "/api/user/rewards/8/coupon-image",
    });
    coupons.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.assign(manager as never, coupon(), 2, 9),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("never reads S3 when another user requests the coupon image", async () => {
    const { service, owned, coupons, storage } = setup();
    owned.findOneBy.mockResolvedValue(null);
    await expect(service.ownerImage(2, 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(owned.findOneBy).toHaveBeenCalledWith({ id: 8, userId: 2 });
    expect(coupons.findOne).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("reads a private image only after checking both ownership records", async () => {
    const { service, coupons, storage } = setup();
    await expect(service.ownerImage(1, 8)).resolves.toEqual({
      body: image.buffer,
      contentType: "image/png",
    });
    expect(coupons.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userRewardId: 8, assignedUserId: 1 }),
      }),
    );
    expect(storage.read).toHaveBeenCalledWith("private/secret-image");
  });

  it("rejects stored unsafe MIME before reading S3", async () => {
    const { service, storage } = setup(
      coupon({ imageContentType: "text/html" }),
    );
    await expect(service.ownerImage(1, 8)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  it.each([
    { assignedUserId: 1, userRewardId: 8, status: RewardCouponStatus.ASSIGNED },
    { status: RewardCouponStatus.USED },
    { expiresAt: new Date("2020-01-01") },
  ])(
    "cannot change assigned/used/expired coupon status (case %#)",
    async (overrides) => {
      const { service, coupons } = setup(coupon(overrides));
      await expect(
        service.updateStatus(3, 12, { status: RewardCouponStatus.AVAILABLE }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(coupons.update).not.toHaveBeenCalled();
    },
  );

  it("disables an unassigned coupon under row lock", async () => {
    const { service, coupons } = setup();
    await service.updateStatus(3, 12, { status: RewardCouponStatus.DISABLED });
    expect(coupons.findOne).toHaveBeenCalledWith({
      where: { id: 12, rewardId: 3 },
      lock: { mode: "pessimistic_write" },
    });
    expect(coupons.update).toHaveBeenCalledWith(
      { id: 12 },
      { status: RewardCouponStatus.DISABLED },
    );
  });

  it("marks an assigned coupon used with owner-scoped locking", async () => {
    const { service, manager, coupons } = setup(
      coupon({
        assignedUserId: 1,
        userRewardId: 8,
        status: RewardCouponStatus.ASSIGNED,
      }),
    );
    await service.markUsed(manager as never, 1, 8);
    expect(coupons.findOne).toHaveBeenCalledWith({
      where: { userRewardId: 8, assignedUserId: 1 },
      lock: { mode: "pessimistic_write" },
    });
    expect(coupons.update).toHaveBeenCalledWith(
      { id: 12 },
      expect.objectContaining({ status: RewardCouponStatus.USED }),
    );
  });
});

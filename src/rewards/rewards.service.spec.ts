import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, jest } from "@jest/globals";
import {
  RewardRedemption,
  RewardRedemptionStatus,
} from "../entities/reward-redemption.entity";
import { Reward, RewardType, UserReward } from "../entities/reward.entity";
import { User } from "../entities/user.entity";
import { rewardPurchasePoint, RewardsService } from "./rewards.service";

const IDEMPOTENCY_KEY = "18de9a37-bae4-4f20-a1b8-6f27bf82bc95";

function reward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: 3,
    name: "집중 후 커피",
    type: RewardType.COUPON,
    point: 1_000,
    description: "작은 휴식",
    discount: true,
    discountRate: 15,
    isActive: true,
    imageUrl: null,
    availableFrom: null,
    exchangeEnabled: true,
    stockQuantity: 2,
    ...overrides,
  } as Reward;
}

function setupRedeem(options?: {
  hasStock?: boolean;
  balance?: number;
  existing?: RewardRedemption | null;
  reward?: Reward | null;
}) {
  const userLock = jest.fn(() => Promise.resolve({ id: 1 }));
  const rewardFind = jest.fn(() =>
    Promise.resolve(options?.reward === undefined ? reward() : options.reward),
  );
  const rewardSave = jest.fn((value: Reward) => Promise.resolve(value));
  const existingFind = jest.fn(() =>
    Promise.resolve(options?.existing ?? null),
  );
  const redemptionCreate = jest.fn((value: object) => value);
  const redemptionSave = jest.fn((value: Record<string, unknown>) =>
    Promise.resolve({
      id: value.id ?? 12,
      createdAt: value.createdAt ?? new Date(),
      updatedAt: value.updatedAt ?? new Date(),
      ...value,
    }),
  );
  const ownedCreate = jest.fn((value: object) => value);
  const ownedSave = jest.fn((value: object) =>
    Promise.resolve({
      id: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...value,
    }),
  );
  const ownedFind = jest.fn(() =>
    Promise.resolve({
      id: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 1,
      rewardId: 3,
      rewardName: "집중 후 커피",
      rewardType: RewardType.COUPON,
      rewardPoint: 850,
      rewardDescription: "작은 휴식",
      discount: true,
      discountRate: 15,
      isUsed: false,
    } as UserReward),
  );

  const repositories = new Map<unknown, unknown>([
    [User, { findOne: userLock }],
    [Reward, { findOne: rewardFind, save: rewardSave }],
    [
      RewardRedemption,
      {
        findOneBy: existingFind,
        create: redemptionCreate,
        save: redemptionSave,
      },
    ],
    [
      UserReward,
      {
        create: ownedCreate,
        save: ownedSave,
        findOneBy: ownedFind,
      },
    ],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
  };
  const dataSource = {
    transaction: jest.fn((work: (value: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const points = {
    total: jest.fn(() => Promise.resolve(options?.balance ?? 900)),
    debitReward: jest.fn(() => Promise.resolve()),
  };
  const couponService = {
    reserve: jest.fn(() =>
      options?.hasStock === false
        ? Promise.reject(
            new BadRequestException("준비된 쿠폰이 모두 소진되었습니다."),
          )
        : Promise.resolve({ id: 21 }),
    ),
    assign: jest.fn(() =>
      Promise.resolve({
        couponCode: "123456789012",
        couponImageUrl: "/api/user/rewards/8/coupon-image",
        expiresAt: new Date("2099-01-01"),
      }),
    ),
    ownerDetails: jest.fn(() => Promise.resolve(new Map())),
  };
  const service = new RewardsService(
    {} as never,
    {} as never,
    points as never,
    dataSource as never,
    couponService as never,
  );

  return {
    service,
    userLock,
    rewardFind,
    rewardSave,
    redemptionCreate,
    redemptionSave,
    ownedCreate,
    ownedSave,
    ownedFind,
    points,
    couponService,
  };
}

describe("RewardsService", () => {
  it("calculates the discounted purchase point as an integer", () => {
    expect(rewardPurchasePoint(reward())).toBe(850);
    expect(rewardPurchasePoint(reward({ point: 99, discountRate: 10 }))).toBe(
      89,
    );
    expect(rewardPurchasePoint(reward({ discount: false }))).toBe(1_000);
    expect(rewardPurchasePoint(reward({ discountRate: 100 }))).toBe(0);
    expect(rewardPurchasePoint(reward({ discountRate: 150 }))).toBe(0);
    expect(rewardPurchasePoint(reward({ discountRate: -10 }))).toBe(1_000);
  });

  it("locks the user and stores one redemption with its point debit", async () => {
    const {
      service,
      userLock,
      rewardFind,
      rewardSave,
      redemptionCreate,
      ownedCreate,
      points,
    } = setupRedeem();

    const result = await service.redeem(1, 3, IDEMPOTENCY_KEY);

    expect(userLock).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: "pessimistic_write" },
    });
    expect(userLock.mock.invocationCallOrder[0]).toBeLessThan(
      points.total.mock.invocationCallOrder[0],
    );
    expect(rewardFind).toHaveBeenCalledWith({
      where: { id: 3, isActive: true },
      lock: { mode: "pessimistic_write" },
    });
    expect(rewardSave).not.toHaveBeenCalled();
    expect(redemptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        rewardId: 3,
        idempotencyKey: IDEMPOTENCY_KEY,
        point: 850,
      }),
    );
    expect(points.debitReward).toHaveBeenCalledWith(
      1,
      850,
      12,
      expect.anything(),
    );
    expect(ownedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ rewardPoint: 850 }),
    );
    expect(result.point).toBe(850);
    expect(result.couponCode).toBe("123456789012");
    expect(result.couponImageUrl).toBe("/api/user/rewards/8/coupon-image");
  });

  it("returns the existing result without charging the same request twice", async () => {
    const existing = {
      id: 12,
      userId: 1,
      rewardId: 3,
      idempotencyKey: IDEMPOTENCY_KEY,
      point: 850,
      status: RewardRedemptionStatus.COMPLETED,
      userRewardId: 8,
    } as RewardRedemption;
    const { service, points, redemptionSave, ownedFind, couponService } =
      setupRedeem({
        existing,
      });

    const result = await service.redeem(1, 3, IDEMPOTENCY_KEY);

    expect(result.id).toBe(8);
    expect(ownedFind).toHaveBeenCalledWith({ id: 8, userId: 1 });
    expect(points.total).not.toHaveBeenCalled();
    expect(points.debitReward).not.toHaveBeenCalled();
    expect(redemptionSave).not.toHaveBeenCalled();
    expect(couponService.reserve).not.toHaveBeenCalled();
    expect(couponService.assign).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key for another reward", async () => {
    const existing = {
      userId: 1,
      rewardId: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
    } as RewardRedemption;
    const { service, points } = setupRedeem({ existing });

    await expect(service.redeem(1, 3, IDEMPOTENCY_KEY)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(points.total).not.toHaveBeenCalled();
  });

  it("rejects redemption when points are below the discounted price", async () => {
    const { service, ownedSave, points } = setupRedeem({ balance: 849 });

    await expect(service.redeem(1, 3, IDEMPOTENCY_KEY)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ownedSave).not.toHaveBeenCalled();
    expect(points.debitReward).not.toHaveBeenCalled();
  });

  it("rejects redemption when the reward is missing or inactive", async () => {
    const { service, points } = setupRedeem({ reward: null });

    await expect(service.redeem(1, 99, IDEMPOTENCY_KEY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(points.total).not.toHaveBeenCalled();
  });

  it("rejects redemption when coupon stock is exhausted", async () => {
    const { service, rewardSave, ownedSave, points } = setupRedeem({
      hasStock: false,
      reward: reward({ stockQuantity: 999 }),
    });

    await expect(service.redeem(1, 3, IDEMPOTENCY_KEY)).rejects.toThrow(
      "준비된 쿠폰이 모두 소진되었습니다.",
    );
    expect(rewardSave).not.toHaveBeenCalled();
    expect(ownedSave).not.toHaveBeenCalled();
    expect(points.debitReward).not.toHaveBeenCalled();
  });

  it("rejects redemption while exchange is disabled", async () => {
    const { service, rewardSave, points } = setupRedeem({
      reward: reward({ exchangeEnabled: false }),
    });

    await expect(service.redeem(1, 3, IDEMPOTENCY_KEY)).rejects.toThrow(
      "현재 교환이 잠시 중단된 보상입니다.",
    );
    expect(rewardSave).not.toHaveBeenCalled();
    expect(points.total).not.toHaveBeenCalled();
  });

  it("rejects redemption before its scheduled opening time", async () => {
    const { service, rewardSave, points } = setupRedeem({
      reward: reward({ availableFrom: new Date("2099-01-01T00:00:00.000Z") }),
    });

    await expect(service.redeem(1, 3, IDEMPOTENCY_KEY)).rejects.toThrow(
      "아직 교환이 시작되지 않은 보상입니다.",
    );
    expect(rewardSave).not.toHaveBeenCalled();
    expect(points.total).not.toHaveBeenCalled();
  });
});

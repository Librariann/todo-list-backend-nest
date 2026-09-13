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
    ...overrides,
  } as Reward;
}

function setupRedeem(options?: {
  balance?: number;
  existing?: RewardRedemption | null;
  reward?: Reward | null;
}) {
  const userLock = jest.fn(() => Promise.resolve({ id: 1 }));
  const rewardFind = jest.fn(() =>
    Promise.resolve(options?.reward === undefined ? reward() : options.reward),
  );
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
    [Reward, { findOneBy: rewardFind }],
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
  const service = new RewardsService(
    {} as never,
    {} as never,
    points as never,
    dataSource as never,
  );

  return {
    service,
    userLock,
    redemptionCreate,
    redemptionSave,
    ownedCreate,
    ownedSave,
    ownedFind,
    points,
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
    const { service, userLock, redemptionCreate, ownedCreate, points } =
      setupRedeem();

    const result = await service.redeem(1, 3, IDEMPOTENCY_KEY);

    expect(userLock).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: "pessimistic_write" },
    });
    expect(userLock.mock.invocationCallOrder[0]).toBeLessThan(
      points.total.mock.invocationCallOrder[0],
    );
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
    const { service, points, redemptionSave, ownedFind } = setupRedeem({
      existing,
    });

    const result = await service.redeem(1, 3, IDEMPOTENCY_KEY);

    expect(result.id).toBe(8);
    expect(ownedFind).toHaveBeenCalledWith({ id: 8, userId: 1 });
    expect(points.total).not.toHaveBeenCalled();
    expect(points.debitReward).not.toHaveBeenCalled();
    expect(redemptionSave).not.toHaveBeenCalled();
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
});

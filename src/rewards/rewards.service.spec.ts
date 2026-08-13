import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, jest } from "@jest/globals";
import { Reward, RewardType } from "../entities/reward.entity";
import { rewardPurchasePoint, RewardsService } from "./rewards.service";

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

  it("checks and debits the discounted point when redeeming", async () => {
    const saved = jest.fn((value: unknown) => ({
      id: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(value as object),
    }));
    const create = jest.fn((value: unknown) => value);
    const debitReward = jest.fn();
    const service = new RewardsService(
      {
        findOneBy: jest.fn(() => Promise.resolve(reward())),
      } as never,
      { save: saved, create } as never,
      {
        total: jest.fn(() => Promise.resolve(900)),
        debitReward,
      } as never,
    );

    const result = await service.redeem(1, 3);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ rewardPoint: 850 }),
    );
    expect(debitReward).toHaveBeenCalledWith(1, 850, 3);
    expect(result.point).toBe(850);
  });

  it("rejects redemption when points are below the discounted price", async () => {
    const save = jest.fn();
    const debitReward = jest.fn();
    const service = new RewardsService(
      { findOneBy: jest.fn(() => Promise.resolve(reward())) } as never,
      { save, create: jest.fn() } as never,
      {
        total: jest.fn(() => Promise.resolve(849)),
        debitReward,
      } as never,
    );

    await expect(service.redeem(1, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(save).not.toHaveBeenCalled();
    expect(debitReward).not.toHaveBeenCalled();
  });

  it("rejects redemption when the reward is missing or inactive", async () => {
    const total = jest.fn();
    const service = new RewardsService(
      { findOneBy: jest.fn(() => Promise.resolve(null)) } as never,
      { save: jest.fn(), create: jest.fn() } as never,
      { total, debitReward: jest.fn() } as never,
    );

    await expect(service.redeem(1, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(total).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserReward } from "../entities/reward.entity";
import { RewardsService } from "./rewards.service";

function setup() {
  const item = {
    id: 8,
    userId: 1,
    isUsed: false,
    rewardName: "쿠폰 보상",
  } as UserReward;
  const owned = {
    find: jest.fn(() => Promise.resolve([item])),
    findOne: jest.fn(() => Promise.resolve<UserReward | null>(item)),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
  };
  const manager = { getRepository: jest.fn(() => owned) };
  const dataSource = {
    transaction: jest.fn((work: (value: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const coupons = {
    ownerDetails: jest.fn(() =>
      Promise.resolve(
        new Map([
          [
            8,
            {
              couponCode: "123456789012",
              couponImageUrl: "/api/user/rewards/8/coupon-image",
              expiresAt: new Date("2099-01-01"),
            },
          ],
        ]),
      ),
    ),
    markUsed: jest.fn(() => Promise.resolve()),
  };
  const service = new RewardsService(
    {} as never,
    owned as never,
    {} as never,
    dataSource as never,
    coupons as never,
  );
  return { service, owned, manager, dataSource, coupons };
}

describe("owned coupon rewards", () => {
  it("fetches coupon details using the same authenticated owner as the reward list", async () => {
    const { service, owned, coupons } = setup();
    const result = await service.userList(1);
    expect(owned.find).toHaveBeenCalledWith({
      where: { userId: 1 },
      order: { createdAt: "DESC" },
    });
    expect(coupons.ownerDetails).toHaveBeenCalledWith(1, [8]);
    expect(result[0].couponCode).toBe("123456789012");
  });

  it("never decrypts coupon details for the dashboard summary", async () => {
    const { service, coupons } = setup();
    const result = await service.userSummaryList(1);
    expect(result[0]).not.toHaveProperty("couponCode");
    expect(result[0]).not.toHaveProperty("couponImageUrl");
    expect(result[0]).not.toHaveProperty("expiresAt");
    expect(coupons.ownerDetails).not.toHaveBeenCalled();
  });

  it("marks coupon and UserReward used in one owner-scoped transaction", async () => {
    const { service, owned, manager, dataSource, coupons } = setup();
    const result = await service.use(1, 8);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(owned.findOne).toHaveBeenCalledWith({
      where: { id: 8, userId: 1 },
      lock: { mode: "pessimistic_write" },
    });
    expect(coupons.markUsed).toHaveBeenCalledWith(manager, 1, 8);
    expect(owned.update).toHaveBeenCalledWith(
      { id: 8, userId: 1 },
      { isUsed: true },
    );
    expect(result.isUsed).toBe(true);
  });

  it("does not mark UserReward used when coupon validation fails", async () => {
    const { service, owned, coupons } = setup();
    coupons.markUsed.mockRejectedValue(new BadRequestException("expired"));
    await expect(service.use(1, 8)).rejects.toBeInstanceOf(BadRequestException);
    expect(owned.update).not.toHaveBeenCalled();
  });

  it("does not access coupon details for another user's reward", async () => {
    const { service, owned, coupons } = setup();
    owned.findOne.mockResolvedValue(null);
    await expect(service.use(2, 8)).rejects.toBeInstanceOf(NotFoundException);
    expect(coupons.markUsed).not.toHaveBeenCalled();
    expect(coupons.ownerDetails).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "@jest/globals";
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  ValidationPipe,
} from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../entities/user.entity";
import { CreateRewardCouponDto } from "./dto/create-reward-coupon.dto";
import { UpdateRewardCouponStatusDto } from "./dto/update-reward-coupon-status.dto";
import { RewardCouponsController } from "./reward-coupons.controller";
import { UserRewardsController } from "./rewards.controller";

describe("coupon API validation and permissions", () => {
  const reflector = new Reflector();
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it.each(["list", "create", "updateStatus"] as const)(
    "requires ADMIN for inventory %s",
    (method) => {
      // Inspect the original decorated handler without calling it.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const handler = RewardCouponsController.prototype[method];
      const targets = [handler, RewardCouponsController];
      expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
        UserRole.ADMIN,
      ]);
      expect(
        reflector.getAllAndOverride(IS_PUBLIC_KEY, targets),
      ).toBeUndefined();
      const context = (role: UserRole): ExecutionContext =>
        ({
          getHandler: () => handler,
          getClass: () => RewardCouponsController,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        }) as unknown as ExecutionContext;
      const guard = new RolesGuard(reflector);
      expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
      expect(() => guard.canActivate(context(UserRole.USER))).toThrow(
        ForbiddenException,
      );
    },
  );

  it("keeps the image route authenticated and disables caching/content sniffing", () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const handler = UserRewardsController.prototype.couponImage;
    expect(
      reflector.getAllAndOverride(IS_PUBLIC_KEY, [
        handler,
        UserRewardsController,
      ]),
    ).toBeUndefined();
    expect(reflector.get(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([
        { name: "Cache-Control", value: "private, no-store" },
        { name: "X-Content-Type-Options", value: "nosniff" },
      ]),
    );
  });

  it("validates upload metadata and strips unauthorized assignment fields", async () => {
    const result: unknown = await pipe.transform(
      {
        pinCode: "123456789012",
        expiresAt: "2099-01-01",
        providerOrderNumber: " order-1 ",
        assignedUserId: 99,
      },
      { type: "body", metatype: CreateRewardCouponDto },
    );
    expect(result).toEqual({
      pinCode: "123456789012",
      expiresAt: "2099-01-01",
      providerOrderNumber: "order-1",
    });
  });

  it.each(["ASSIGNED", "USED", "EXPIRED", "UNKNOWN", null])(
    "rejects manual transition to %s",
    async (status) => {
      await expect(
        pipe.transform(
          { status },
          { type: "body", metatype: UpdateRewardCouponStatusDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

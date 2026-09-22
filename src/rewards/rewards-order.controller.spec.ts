import { describe, expect, it } from "@jest/globals";
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { MetadataScanner, Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../entities/user.entity";
import { RewardsController } from "./rewards.controller";

describe("reward reorder route", () => {
  const reflector = new Reflector();
  // Metadata must be read from the unbound original handler.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const handler = RewardsController.prototype.reorder;

  it("registers PATCH order before the dynamic PATCH :id route", () => {
    expect(reflector.get<string>(PATH_METADATA, RewardsController)).toBe(
      "api/rewards",
    );
    expect(reflector.get<string>(PATH_METADATA, handler)).toBe("order");
    expect(reflector.get<RequestMethod>(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
    const methods = new MetadataScanner().getAllMethodNames(
      RewardsController.prototype,
    );
    expect(methods.indexOf("reorder")).toBeLessThan(methods.indexOf("update"));
  });

  it("requires an authenticated administrator", () => {
    const targets = [handler, RewardsController];
    expect(reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets)).toEqual(
      [UserRole.ADMIN],
    );
    expect(
      reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
    const context = (role: UserRole): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => RewardsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as unknown as ExecutionContext;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    expect(() => guard.canActivate(context(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });
});

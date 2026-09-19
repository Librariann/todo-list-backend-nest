import { describe, expect, it } from "@jest/globals";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../entities/user.entity";
import { AdminNoticesController } from "./admin-notices.controller";
import { NoticesController } from "./notices.controller";

describe("notice route access", () => {
  const reflector = new Reflector();

  it("marks only the public controller as public", () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, NoticesController)).toBe(true);
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, AdminNoticesController),
    ).toBeUndefined();
  });

  it.each(["list", "create", "update", "remove"] as const)(
    "requires ADMIN for administrator %s without public bypass",
    (method) => {
      // Read decorator metadata from the original method without invoking it.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const handler = AdminNoticesController.prototype[method];
      expect(
        reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
          handler,
          AdminNoticesController,
        ]),
      ).toEqual([UserRole.ADMIN]);
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler,
          AdminNoticesController,
        ]),
      ).toBeUndefined();
      const context = (role: UserRole): ExecutionContext =>
        ({
          getHandler: () => handler,
          getClass: () => AdminNoticesController,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        }) as unknown as ExecutionContext;
      const guard = new RolesGuard(reflector);
      expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
      expect(() => guard.canActivate(context(UserRole.USER))).toThrow(
        ForbiddenException,
      );
    },
  );
});

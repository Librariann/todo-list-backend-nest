import { describe, expect, it, jest } from "@jest/globals";
import { PeriodType } from "../common/date";
import {
  PointAction,
  PointMetaType,
  PointReason,
} from "../entities/user-point.entity";
import { PointsService } from "./points.service";

function pointRepository(balance: number) {
  const save = jest.fn();
  const create = jest.fn((value: unknown) => value);
  const builder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(() =>
      Promise.resolve({ balance: String(balance) }),
    ),
  };

  return {
    repository: {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      create,
      save,
    },
    create,
    save,
  };
}

describe("PointsService challenge ledger", () => {
  it("credits only the missing amount when a challenge is re-achieved", async () => {
    const { repository, create, save } = pointRepository(10);
    const service = new PointsService(repository as never, {} as never);

    await service.awardChallenge(7, 30, 2, PeriodType.WEEKLY, undefined, "2026-08-24");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: PointAction.CREDIT,
        reason: PointReason.CHALLENGE,
        metaType: PointMetaType.CHALLENGE,
        metaId: 2,
        point: 20,
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not issue a duplicate credit when the reward is already balanced", async () => {
    const { repository, save } = pointRepository(30);
    const service = new PointsService(repository as never, {} as never);

    await service.awardChallenge(7, 30, 2, PeriodType.WEEKLY, undefined, "2026-08-24");

    expect(save).not.toHaveBeenCalled();
  });

  it("writes a reversal debit for the remaining challenge reward", async () => {
    const { repository, create, save } = pointRepository(30);
    const service = new PointsService(repository as never, {} as never);

    await service.revokeChallenge(7, 2, PeriodType.WEEKLY, "2026-08-24");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: PointAction.DEBIT,
        reason: PointReason.CHALLENGE_REVERSAL,
        metaType: PointMetaType.CHALLENGE,
        metaId: 2,
        point: 30,
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });
});

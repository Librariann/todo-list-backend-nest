import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException } from "@nestjs/common";
import { Reward, RewardType } from "../entities/reward.entity";
import { RewardsService } from "./rewards.service";

function reward(id: number, sortOrder = 0): Reward {
  return {
    id,
    sortOrder,
    name: `보상 ${id}`,
    type: RewardType.COUPON,
    point: 100,
    description: "테스트 보상",
    discount: false,
    discountRate: 0,
    isActive: true,
    imageUrl: null,
    availableFrom: null,
    exchangeEnabled: true,
    stockQuantity: 3,
    createdAt: new Date("2026-09-20T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
  };
}

function setup(rows: Reward[] = [reward(1), reward(2)]) {
  const query = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn(() => Promise.resolve(rows)),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => query),
    find: jest.fn(() =>
      Promise.resolve(
        [...rows].sort(
          (a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id),
        ),
      ),
    ),
    findOneBy: jest.fn(() => Promise.resolve(rows[0])),
    findOneByOrFail: jest.fn(() => Promise.resolve(rows[0])),
    update: jest.fn((criteria: { id: number }, values: Partial<Reward>) => {
      const item = rows.find((row) => Number(row.id) === criteria.id);
      if (item) Object.assign(item, values);
      return Promise.resolve({ affected: item ? 1 : 0 });
    }),
    exists: jest.fn(() => Promise.resolve(false)),
    maximum: jest.fn(() => Promise.resolve<number | null>(9)),
    create: jest.fn((values: Partial<Reward>) => ({ ...reward(3), ...values })),
    save: jest.fn((value: Reward) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn(() => repository),
    query: jest.fn(() => Promise.resolve()),
  };
  const dataSource = {
    transaction: jest.fn((work: (value: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const service = new RewardsService(
    repository as never,
    {} as never,
    {} as never,
    dataSource as never,
  );
  return { service, repository, query, dataSource, rows, manager };
}

describe("reward ordering", () => {
  it("lists active rewards by persisted order with deterministic legacy ties", async () => {
    const { service, repository } = setup([reward(2), reward(1)]);
    const result = await service.list();
    expect(repository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    expect(result.map((item) => item.id)).toEqual([1, 2]);
    expect(result.map((item) => item.sortOrder)).toEqual([0, 0]);
  });

  it("locks rows in id order and updates only sortOrder within a transaction", async () => {
    const { service, repository, query, dataSource } = setup();
    const result = await service.reorder({ rewardIds: [2, 1] });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(query.where).toHaveBeenCalledWith("reward.isActive = :isActive", {
      isActive: true,
    });
    expect(query.orderBy).toHaveBeenCalledWith("reward.id", "ASC");
    expect(query.setLock).toHaveBeenCalledWith("pessimistic_write");
    expect(query.getMany.mock.invocationCallOrder[0]).toBeLessThan(
      repository.update.mock.invocationCallOrder[0],
    );
    expect(repository.update.mock.calls).toEqual([
      [{ id: 2 }, { sortOrder: 1 }],
      [{ id: 1 }, { sortOrder: 2 }],
    ]);
    expect(repository.save).not.toHaveBeenCalled();
    expect(
      result.map(({ id, sortOrder, stockQuantity }) => ({
        id,
        sortOrder,
        stockQuantity,
      })),
    ).toEqual([
      { id: 2, sortOrder: 1, stockQuantity: 3 },
      { id: 1, sortOrder: 2, stockQuantity: 3 },
    ]);
    expect(repository.find.mock.invocationCallOrder[0]).toBeGreaterThan(
      repository.update.mock.invocationCallOrder[1],
    );
  });

  it("matches PostgreSQL bigint string ids against numeric request ids", async () => {
    const { service } = setup([{ ...reward(1), id: "1" as unknown as number }]);
    await expect(service.reorder({ rewardIds: [1] })).resolves.toHaveLength(1);
  });

  it.each([[1], [1, 3], [1, 1], [1, 2, 3]])(
    "rejects stale, foreign, or duplicate full-list orders (%j) before writing",
    async (...rewardIds: number[]) => {
      const { service, repository } = setup();
      await expect(service.reorder({ rewardIds })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it("appends newly created rewards after the maximum stored order", async () => {
    const { service, repository } = setup();
    const result = await service.create({
      name: "새로운 보상",
      point: 100,
      description: "설명",
    });
    expect(repository.maximum).toHaveBeenCalledWith("sortOrder");
    expect(result.sortOrder).toBe(10);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 10 }),
    );
  });

  it("starts an empty reward catalog at order one", async () => {
    const { service, repository } = setup();
    repository.maximum.mockResolvedValue(null);
    const result = await service.create({
      name: "첫 번째 보상",
      point: 100,
      description: "설명",
    });
    expect(result.sortOrder).toBe(1);
  });

  it("acquires the same transaction lock before creation reads and reorder row locks", async () => {
    const creation = setup();
    const reorder = setup();
    await creation.service.create({
      name: "순서 잠금 보상",
      point: 100,
      description: "설명",
    });
    await reorder.service.reorder({ rewardIds: [2, 1] });

    const expectedLock = [
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      ["rewards:catalog-order"],
    ];
    expect(creation.manager.query.mock.calls).toEqual([expectedLock]);
    expect(reorder.manager.query.mock.calls).toEqual([expectedLock]);
    expect(creation.manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      creation.repository.exists.mock.invocationCallOrder[0],
    );
    expect(creation.manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      creation.repository.maximum.mock.invocationCallOrder[0],
    );
    expect(reorder.manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      reorder.query.setLock.mock.invocationCallOrder[0],
    );
    expect(reorder.manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      reorder.query.getMany.mock.invocationCallOrder[0],
    );
  });

  it("uses only the transaction repository for the entire creation", async () => {
    const { dataSource, repository } = setup();
    const service = new RewardsService(
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
    );
    await expect(
      service.create({
        name: "트랜잭션 보상",
        point: 100,
        description: "설명",
      }),
    ).resolves.toMatchObject({ sortOrder: 10 });
    expect(repository.exists).toHaveBeenCalledTimes(1);
    expect(repository.maximum).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("propagates insert failures through the transaction callback for rollback", async () => {
    const { service, repository, dataSource } = setup();
    const failure = new Error("insert failed");
    repository.save.mockRejectedValue(failure);
    await expect(
      service.create({
        name: "실패하는 보상",
        point: 100,
        description: "설명",
      }),
    ).rejects.toBe(failure);
    await expect(dataSource.transaction.mock.results[0].value).rejects.toBe(
      failure,
    );
  });

  it("admin edits never resave stale order or stock fields", async () => {
    const { service, repository } = setup();
    const result = await service.update(1, { name: "이름 수정" });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      { name: "이름 수정" },
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(result.stockQuantity).toBe(3);
  });

  it("admin removal updates only active status", async () => {
    const { service, repository } = setup();
    await service.remove(1);
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      { isActive: false },
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("preserves empty patch behavior without an empty SQL update", async () => {
    const { service, repository } = setup();
    await expect(service.update(1, {})).resolves.toMatchObject({ id: 1 });
    expect(repository.update).not.toHaveBeenCalled();
  });
});

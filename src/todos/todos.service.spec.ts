import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { BadRequestException } from "@nestjs/common";
import { WorkType } from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { TodosService } from "./todos.service";

function todo(status = TodoStatus.READY, targetDate = "2026-08-24"): Todo {
  return {
    id: 5,
    userId: 7,
    name: "테스트 할 일",
    status,
    targetDate,
    orderIndex: 1,
  } as Todo;
}

describe("TodosService.status", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-24T12:00:00+09:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function setup(entity: Todo) {
    const save = jest
      .fn()
      .mockImplementation((value) => Promise.resolve(value));
    const repository = {
      findOne: jest.fn(() => Promise.resolve(entity)),
      save,
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repository) };
    const recalculateProgress = jest.fn(() =>
      Promise.resolve([
        {
          challengeId: 1,
          name: "할 일 도전",
          description: "할 일을 완료해요",
          point: 30,
          periodType: "DAILY",
          periodKey: "2026-08-24",
        },
      ]),
    );
    const dataSource = {
      transaction: jest.fn(
        (callback: (value: typeof manager) => Promise<void>) =>
          callback(manager),
      ),
    };
    const service = new TodosService(
      {} as never,
      { recalculateProgress } as never,
      dataSource as never,
    );

    return { service, manager, save, recalculateProgress };
  }

  it("syncs challenge progress when a todo is completed", async () => {
    const entity = todo();
    const { service, manager, save, recalculateProgress } = setup(entity);

    const result = await service.status(7, 5, TodoStatus.DONE);

    expect(entity.status).toBe(TodoStatus.DONE);
    expect(save).toHaveBeenCalledWith(entity);
    expect(recalculateProgress).toHaveBeenCalledWith(
      7,
      WorkType.TODOS,
      manager,
    );
    expect(result.achievements).toHaveLength(1);
  });

  it("syncs challenge progress when completion is cancelled", async () => {
    const entity = todo(TodoStatus.DONE);
    const { service, manager, recalculateProgress } = setup(entity);

    await service.status(7, 5, TodoStatus.READY);

    expect(entity.status).toBe(TodoStatus.READY);
    expect(recalculateProgress).toHaveBeenCalledWith(
      7,
      WorkType.TODOS,
      manager,
    );
  });

  it("does not sync challenges for a non-completion status change", async () => {
    const { service, recalculateProgress } = setup(todo());

    await service.status(7, 5, TodoStatus.PROCESS);

    expect(recalculateProgress).not.toHaveBeenCalled();
  });

  it("rejects completing a future todo", async () => {
    const { service, save, recalculateProgress } = setup(
      todo(TodoStatus.READY, "2026-08-25"),
    );

    await expect(service.status(7, 5, TodoStatus.DONE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(save).not.toHaveBeenCalled();
    expect(recalculateProgress).not.toHaveBeenCalled();
  });
});

describe("TodosService.markedDates", () => {
  it("returns unique dates that have todos in the requested range", async () => {
    const find = jest.fn(() =>
      Promise.resolve([
        todo(TodoStatus.READY, "2026-10-03"),
        todo(TodoStatus.DONE, "2026-10-03"),
        todo(TodoStatus.READY, "2026-10-18"),
      ]),
    );
    const service = new TodosService(
      { find } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.markedDates(7, "2026-10-01", "2026-10-31"),
    ).resolves.toEqual(["2026-10-03", "2026-10-18"]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid or reversed date range", async () => {
    const service = new TodosService({} as never, {} as never, {} as never);

    await expect(
      service.markedDates(7, "2026-10-31", "2026-10-01"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.markedDates(7, "2026-10-01", "2026-10-99"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

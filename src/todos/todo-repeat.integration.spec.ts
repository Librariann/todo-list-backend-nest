import { BadRequestException, NotFoundException } from "@nestjs/common";
import { validateSync } from "class-validator";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DataSource } from "typeorm";
import { addDays, today } from "../common/date";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { User } from "../entities/user.entity";
import { UpdateTodoDto } from "./dto/update-todos.dto";
import { TodosService } from "./todos.service";

describe("repeatDaily request validation", () => {
  it("accepts a boolean but rejects strings and null", () => {
    const errors = (value: unknown) =>
      validateSync(Object.assign(new UpdateTodoDto(), { repeatDaily: value }));
    expect(errors(true)).toEqual([]);
    expect(errors(false)).toEqual([]);
    expect(errors(undefined)).toEqual([]);
    expect(errors("true")).not.toEqual([]);
    expect(errors(null)).not.toEqual([]);
  });
});

const databaseUrl = process.env.TODO_REPEATS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("daily todo repeats in PostgreSQL", () => {
  let db: DataSource;
  let service: TodosService;
  let user: User;
  let other: User;
  const currentDay = today();
  const dateAfter = (days: number) => addDays(currentDay, days);

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.endsWith("_test")
    ) {
      throw new Error("Use a disposable localhost database ending in _test");
    }
    db = new DataSource({
      type: "postgres",
      url: databaseUrl,
      entities: [User, Todo],
      synchronize: false,
    });
    await db.initialize();
    await db.query("CREATE SCHEMA IF NOT EXISTS todo_list");
    await db.synchronize();
    await db.query(`
      ALTER TABLE todo_list.todos
        DROP COLUMN repeat_series_id,
        DROP COLUMN repeat_daily,
        DROP COLUMN reminder_time
    `);
    const migration = await readFile(
      resolve(__dirname, "../../migrations/20261111_add_daily_todo_repeats.sql"),
      "utf8",
    );
    await db.query(migration);
    await db.query(migration);

    service = new TodosService(
      db.getRepository(Todo),
      { recalculateProgress: () => Promise.resolve([]) } as never,
      db,
    );
    user = await db.getRepository(User).save({
      nickname: "반복테스트",
      email: "repeat@example.test",
      password: "test-only",
    });
    other = await db.getRepository(User).save({
      nickname: "다른테스트",
      email: "other@example.test",
      password: "test-only",
    });
  });

  beforeEach(async () => {
    await db.getRepository(Todo).delete({ userId: user.id });
    await db.getRepository(Todo).delete({ userId: other.id });
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query("DROP SCHEMA IF EXISTS todo_list CASCADE");
      await db.destroy();
    }
  });

  it("stores reminders on the todo date using the requested Seoul clock time", async () => {
    const targetDate = dateAfter(2);
    const original = await service.create(user.id, {
      name: "저녁 할 일",
      targetDate,
      reminderAt: `${dateAfter(3)}T15:15:00Z`,
    });
    expect(original.reminderAt).toEqual(new Date(`${targetDate}T00:15:00+09:00`));

    const updated = await service.update(user.id, original.id, {
      reminderAt: `${dateAfter(4)}T19:30:00+09:00`,
      repeatDaily: true,
    });
    expect(updated.repeatReminderTime).toBe("19:30");
    expect(await service.list(user.id, targetDate)).toEqual([
      expect.objectContaining({ reminderAt: new Date(`${targetDate}T19:30:00+09:00`) }),
    ]);

    await expect(service.create(user.id, {
      name: "이미 지난 알림",
      targetDate: currentDay,
      reminderAt: `${dateAfter(3)}T00:00:00+09:00`,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("generates one fresh occurrence per series after KST midnight, even concurrently", async () => {
    const original = await service.create(user.id, {
      name: "매일 공부하기",
      targetDate: currentDay,
    });
    await db.getRepository(Todo).update(original.id, {
      reminderAt: new Date(`${currentDay}T09:15:00+09:00`),
      reminderTime: "09:15",
    });
    expect(original.repeatDaily).toBe(false);
    await service.update(user.id, original.id, { repeatDaily: true });
    await service.status(user.id, original.id, TodoStatus.DONE);
    const edited = await service.update(user.id, original.id, {
      name: "매일 영어 공부하기",
    });
    expect(edited.reminderAt).toBeNull();
    expect(edited.repeatReminderTime).toBe("09:15");

    await service.materializeDailyRepeats(
      new Date(`${currentDay}T23:59:59+09:00`),
    );
    expect(await service.list(user.id, dateAfter(1))).toEqual([]);

    const nextMidnight = new Date(`${dateAfter(1)}T00:00:00+09:00`);
    await Promise.all([
      service.materializeDailyRepeats(nextMidnight),
      service.materializeDailyRepeats(nextMidnight, user.id),
      service.materializeDailyRepeats(nextMidnight),
    ]);
    const rows = await service.list(user.id, dateAfter(1));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: edited.name,
      status: TodoStatus.READY,
      repeatDaily: true,
      repeatReminderTime: "09:15",
      reminderAt: new Date(`${dateAfter(1)}T09:15:00+09:00`),
    });
    expect(await service.list(user.id, currentDay)).toEqual([
      expect.objectContaining({ status: TodoStatus.DONE, repeatDaily: false }),
    ]);
  });

  it("catches up only the current day and retains a missed reminder clock for later days", async () => {
    const original = await service.create(user.id, {
      name: "아침 기록",
      targetDate: currentDay,
    });
    await db.getRepository(Todo).update(original.id, {
      reminderAt: null,
      reminderTime: "08:00",
    });
    const enabled = await service.update(user.id, original.id, {
      repeatDaily: true,
    });
    expect(enabled.repeatReminderTime).toBe("08:00");

    await service.materializeDailyRepeats(
      new Date(`${dateAfter(3)}T13:00:00+09:00`),
    );
    expect(await service.list(user.id, dateAfter(1))).toEqual([]);
    expect(await service.list(user.id, dateAfter(2))).toEqual([]);
    expect(await service.list(user.id, dateAfter(3))).toEqual([
      expect.objectContaining({
        repeatDaily: true,
        repeatReminderTime: "08:00",
        reminderAt: null,
      }),
    ]);

    await service.materializeDailyRepeats(
      new Date(`${dateAfter(4)}T00:00:00+09:00`),
    );
    expect(await service.list(user.id, dateAfter(4))).toEqual([
      expect.objectContaining({
        reminderAt: new Date(`${dateAfter(4)}T08:00:00+09:00`),
      }),
    ]);
  });

  it("catches up on list or calendar reads, keeps future start dates, and can delete past history", async () => {
    const historical = await db.getRepository(Todo).save({
      userId: user.id,
      name: "오늘부터 이어갈 지난 기록",
      targetDate: dateAfter(-2),
      repeatDaily: true,
      repeatSeriesId: randomUUID(),
    });
    const future = await service.create(user.id, {
      name: "내일부터 시작",
      targetDate: dateAfter(1),
    });
    await service.update(user.id, future.id, { repeatDaily: true });

    const [list, markedDates] = await Promise.all([
      service.list(user.id, currentDay),
      service.markedDates(user.id, currentDay, currentDay),
    ]);
    expect(list).toEqual([
      expect.objectContaining({ name: historical.name, repeatDaily: true }),
    ]);
    expect(markedDates).toEqual([currentDay]);
    await service.remove(user.id, historical.id);
    expect(await service.list(user.id, historical.targetDate)).toEqual([]);

    await service.materializeDailyRepeats(
      new Date(`${dateAfter(1)}T00:00:00+09:00`),
    );
    expect(await service.list(user.id, dateAfter(1))).toEqual([
      expect.objectContaining({
        name: historical.name,
        orderIndex: 2,
        repeatDaily: true,
      }),
      expect.objectContaining({ id: future.id, repeatDaily: true }),
    ]);
  });

  it("honors an explicit reminder clear, prevents changing other users’ or past repeats, and stops on disable/delete", async () => {
    const original = await service.create(user.id, {
      name: "매일 계획",
      targetDate: dateAfter(1),
      reminderAt: `${dateAfter(1)}T19:30:00+09:00`,
    });
    await service.update(user.id, original.id, { repeatDaily: true });
    expect(
      await service.update(user.id, original.id, { reminderAt: null }),
    ).toMatchObject({ repeatDaily: true, repeatReminderTime: null });
    await expect(
      service.update(other.id, original.id, { repeatDaily: false }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const historical = await db.getRepository(Todo).save({
      userId: user.id,
      name: "지난 할 일",
      targetDate: dateAfter(-1),
    });
    await expect(
      service.update(user.id, historical.id, { repeatDaily: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.update(user.id, original.id, { repeatDaily: false });
    await service.materializeDailyRepeats(
      new Date(`${dateAfter(2)}T00:00:00+09:00`),
    );
    expect(await service.list(user.id, dateAfter(2))).toEqual([]);
    await service.update(user.id, original.id, { repeatDaily: true });
    await service.remove(user.id, original.id);
    await service.materializeDailyRepeats(
      new Date(`${dateAfter(3)}T00:00:00+09:00`),
    );
    expect(await service.list(user.id, dateAfter(3))).toEqual([]);
  });
});

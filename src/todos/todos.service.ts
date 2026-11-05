import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { Between, DataSource, EntityManager, Repository } from "typeorm";
import {
  ChallengeAchievementOutput,
  ChallengesService,
} from "../challenges/challenges.service";
import { isValidDateString, today } from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { localClock } from "../push/reminder-time";
import type { CreateTodoDto } from "./dto/create-todos.dto";
import type { ReorderTodoDto } from "./dto/reorder-todos.dto";
import type { UpdateTodoDto } from "./dto/update-todos.dto";

export interface TodoOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  name: string;
  status: TodoStatus;
  orderIndex: number;
  targetDate: string;
  reminderAt: Date | null;
  repeatDaily: boolean;
  repeatReminderTime: string | null;
}

export interface TodoStatusOutput {
  achievements: ChallengeAchievementOutput[];
}

function todoResponse(todo: Todo): TodoOutput {
  const repeatDaily = todo.repeatDaily === true;
  return {
    id: todo.id,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    userId: todo.userId,
    name: todo.name,
    status: todo.status,
    orderIndex: todo.orderIndex,
    targetDate: todo.targetDate,
    reminderAt: todo.reminderAt ?? null,
    repeatDaily,
    repeatReminderTime: repeatDaily ? (todo.reminderTime ?? null) : null,
  };
}

function parseReminderAt(value: string | null | undefined): Date | null {
  if (value == null) return null;
  const reminderAt = new Date(value);
  if (
    !Number.isFinite(reminderAt.getTime()) ||
    reminderAt.getTime() <= Date.now()
  ) {
    throw new BadRequestException(
      "지금보다 나중 시간으로 알림을 설정해주세요.",
    );
  }
  return reminderAt;
}

const KOREAN_TIMEZONE = "Asia/Seoul";

function reminderClock(reminderAt: Date | null): string | null {
  return reminderAt ? localClock(reminderAt, KOREAN_TIMEZONE).time : null;
}

@Injectable()
export class TodosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TodosService.name);

  constructor(
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    private readonly challenges: ChallengesService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    void this.runDailyRepeatSchedule();
  }

  @Cron("0 * * * * *", {
    name: "daily-todo-repeats",
    timeZone: KOREAN_TIMEZONE,
    waitForCompletion: true,
  })
  async runDailyRepeatSchedule(): Promise<void> {
    try {
      await this.materializeDailyRepeats();
    } catch (error) {
      this.logger.error("반복 할 일을 생성하지 못했습니다.", error);
    }
  }

  async materializeDailyRepeats(
    now = new Date(),
    userId?: number,
  ): Promise<void> {
    // Claim the active occurrence and create today's successor in one statement.
    // An outage skips missed dates without dropping the repeating schedule.
    await this.dataSource.query(
      `
      WITH candidates AS (
        SELECT id FROM todo_list.todos
        WHERE repeat_daily AND target_date < $1::date
          ${userId === undefined ? "" : "AND user_id = $3"}
        ORDER BY id
        FOR UPDATE
      ), advanced AS (
        UPDATE todo_list.todos current
        SET repeat_daily = FALSE
        FROM candidates
        WHERE current.id = candidates.id
        RETURNING current.id, user_id, name, repeat_series_id, reminder_time
      ), planned AS (
        SELECT advanced.*,
               ($1::date + reminder_time::time) AT TIME ZONE 'Asia/Seoul'
                 AS next_reminder_at,
               COALESCE((
                 SELECT MAX(order_index) FROM todo_list.todos existing
                 WHERE existing.user_id = advanced.user_id
                   AND existing.target_date = $1::date
               ), 0) + ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id)
                 AS next_order_index
        FROM advanced
      )
      INSERT INTO todo_list.todos (
        user_id, name, status, order_index, target_date, reminder_at,
        reminder_time, repeat_series_id, repeat_daily
      )
      SELECT user_id, name, 'READY', next_order_index, $1::date,
             CASE WHEN next_reminder_at >= $2::timestamptz - INTERVAL '5 minutes'
                  THEN next_reminder_at END,
             reminder_time, repeat_series_id, TRUE
      FROM planned
      `,
      userId === undefined ? [today(now), now] : [today(now), now, userId],
    );
  }

  async list(userId: number, targetDate: string): Promise<TodoOutput[]> {
    const now = new Date();
    if (targetDate === today(now)) {
      await this.materializeDailyRepeats(now, userId);
    }
    const todos = await this.todos.find({
      where: { userId, targetDate },
      order: { orderIndex: "DESC" },
    });

    return todos.map(todoResponse);
  }

  async markedDates(
    userId: number,
    from: string,
    to: string,
  ): Promise<string[]> {
    if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
      throw new BadRequestException(
        "조회 기간은 올바른 YYYY-MM-DD 범위여야 합니다.",
      );
    }

    const now = new Date();
    const currentDate = today(now);
    if (from <= currentDate && currentDate <= to) {
      await this.materializeDailyRepeats(now, userId);
    }

    const todos = await this.todos.find({
      select: { targetDate: true },
      where: { userId, targetDate: Between(from, to) },
      order: { targetDate: "ASC" },
    });

    return [...new Set(todos.map((todo) => todo.targetDate))];
  }

  async create(
    userId: number,
    dto: CreateTodoDto,
    manager?: EntityManager,
  ): Promise<TodoOutput> {
    const todos = manager?.getRepository(Todo) ?? this.todos;
    const { name, targetDate } = dto;
    const now = new Date();
    const currentDate = today(now);
    if (targetDate < currentDate) {
      throw new BadRequestException(
        "지난 날짜에는 할 일을 생성할 수 없습니다.",
      );
    }
    if (!manager && targetDate === currentDate) {
      await this.materializeDailyRepeats(now, userId);
    }

    const exists = await todos.exists({
      where: { userId, name, targetDate },
    });
    if (exists) {
      throw new ConflictException(`이미 사용중인 할 일 입니다: ${name}`);
    }

    const latest = await todos.findOne({
      where: { userId, targetDate },
      order: { orderIndex: "DESC" },
    });

    const reminderAt = parseReminderAt(dto.reminderAt);
    const todo = await todos.save(
      todos.create({
        userId,
        name,
        targetDate,
        reminderAt,
        reminderTime: reminderClock(reminderAt),
        status: TodoStatus.READY,
        orderIndex: (latest?.orderIndex ?? 0) + 1,
      }),
    );

    return todoResponse(todo);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateTodoDto,
  ): Promise<TodoOutput> {
    const now = new Date();
    await this.materializeDailyRepeats(now, userId);
    return this.dataSource.transaction(async (manager) => {
      const todos = manager.getRepository(Todo);
      const todo = await this.lockOwned(todos, userId, id);
      const { name, targetDate, repeatDaily, reminderAt } = dto;
      if (repeatDaily !== undefined && todo.targetDate < today(now)) {
        throw new BadRequestException(
          "지난 날짜의 할 일은 반복 설정을 변경할 수 없어요.",
        );
      }

      const dateChanged = targetDate && targetDate !== todo.targetDate;
      if (dateChanged) {
        if (todo.repeatDaily || repeatDaily === true) {
          throw new BadRequestException(
            "매일 반복 중인 할 일의 날짜는 변경할 수 없어요.",
          );
        }
        todo.repeatSeriesId = null;
        todo.targetDate = targetDate;
      }

      if ((name && name !== todo.name) || dateChanged) {
        const nextName = name ?? todo.name;
        const duplicated = await todos
          .createQueryBuilder("t")
          .where(
            "t.name = :name AND t.user_id = :userId AND t.target_date = :targetDate AND t.id != :id",
            { name: nextName, userId, targetDate: todo.targetDate, id },
          )
          .getExists();
        if (duplicated) {
          throw new ConflictException(`이미 사용중인 할 일명 입니다: ${nextName}`);
        }
        todo.name = nextName;
      }

      if (reminderAt !== undefined) {
        const nextReminderAt = parseReminderAt(reminderAt);
        if (nextReminderAt && todo.status === TodoStatus.DONE) {
          throw new BadRequestException(
            "완료한 할 일에는 알림을 예약할 수 없어요.",
          );
        }
        todo.reminderAt = nextReminderAt;
        todo.reminderTime = reminderClock(nextReminderAt);
      }

      if (repeatDaily !== undefined) {
        todo.repeatDaily = repeatDaily;
        if (repeatDaily) {
          todo.repeatSeriesId ??= randomUUID();
          todo.reminderTime ??= reminderClock(todo.reminderAt);
        }
      }

      return todoResponse(await todos.save(todo));
    });
  }

  async status(
    userId: number,
    id: number,
    status: TodoStatus,
  ): Promise<TodoStatusOutput> {
    let achievements: ChallengeAchievementOutput[] = [];

    await this.dataSource.transaction(async (manager) => {
      const todos = manager.getRepository(Todo);
      const todo = await todos.findOne({
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!todo) {
        throw new NotFoundException(`할 일을 찾을 수 없습니다: ${id}`);
      }

      if (todo.targetDate < today()) {
        throw new BadRequestException(
          "마감된 할 일은 상태를 변경할 수 없습니다.",
        );
      }

      if (todo.targetDate > today() && status === TodoStatus.DONE) {
        throw new BadRequestException(
          "예정된 할 일은 해당 날짜에 완료할 수 있습니다.",
        );
      }

      //DB에 저장된 유저의 상태와 현재 상태가 동일 할 경우 ealry return
      if (todo.status === status) {
        return;
      }

      const userSavedStatus = todo.status === TodoStatus.DONE;
      const userCurrentStatus = status === TodoStatus.DONE;

      const completionChanged = userSavedStatus !== userCurrentStatus;
      todo.status = status;
      if (status === TodoStatus.DONE) todo.reminderAt = null;
      await todos.save(todo);

      if (completionChanged) {
        achievements =
          (await this.challenges.recalculateProgress(
            userId,
            WorkType.TODOS,
            manager,
          )) ?? [];
      }
    });

    return { achievements };
  }

  async reorder(userId: number, dto: ReorderTodoDto): Promise<void> {
    const { targetDate, indexIds } = dto;
    const owned = await this.list(userId, targetDate);
    const ids = new Set(owned.map((t) => Number(t.id)));
    await Promise.all(
      indexIds
        .filter((x) => ids.has(Number(x.id)))
        .map((x, index) => this.todos.update(x.id, { orderIndex: index + 1 })),
    );
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.materializeDailyRepeats(new Date(), userId);
    await this.dataSource.transaction(async (manager) => {
      const todos = manager.getRepository(Todo);
      await todos.remove(await this.lockOwned(todos, userId, id));
    });
  }

  private async lockOwned(
    todos: Repository<Todo>,
    userId: number,
    id: number,
  ): Promise<Todo> {
    const todo = await todos.findOne({
      where: { id, userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!todo) {
      throw new NotFoundException(`할 일을 찾을 수 없습니다: ${id}`);
    }
    return todo;
  }
}

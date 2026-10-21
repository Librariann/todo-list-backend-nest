import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, DataSource, EntityManager, Repository } from "typeorm";
import {
  ChallengeAchievementOutput,
  ChallengesService,
} from "../challenges/challenges.service";
import { isValidDateString, today } from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
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
}

export interface TodoStatusOutput {
  achievements: ChallengeAchievementOutput[];
}

function todoResponse(todo: Todo): TodoOutput {
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

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    private readonly challenges: ChallengesService,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: number, targetDate: string): Promise<TodoOutput[]> {
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
    if (targetDate < today()) {
      throw new BadRequestException(
        "지난 날짜에는 할 일을 생성할 수 없습니다.",
      );
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

    const todo = await todos.save(
      todos.create({
        userId,
        name,
        targetDate,
        reminderAt: parseReminderAt(dto.reminderAt),
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
    const todo = await this.owned(userId, id);

    if (dto.name) {
      const duplicated = await this.todos
        .createQueryBuilder("t")
        .where(
          "t.name = :name AND t.user_id = :userId AND t.target_date = :targetDate AND t.id != :id",
          {
            name: dto.name,
            userId,
            targetDate: dto.targetDate ?? todo.targetDate,
            id,
          },
        )
        .getExists();

      if (duplicated) {
        throw new ConflictException(
          `이미 사용중인 할 일명 입니다: ${dto.name}`,
        );
      }
    }

    const { reminderAt, ...changes } = dto;
    const update: Partial<Todo> = { ...changes };
    if (reminderAt !== undefined) {
      update.reminderAt = parseReminderAt(reminderAt);
    }
    if (Object.keys(update).length > 0) {
      const query = this.todos
        .createQueryBuilder()
        .update()
        .set(update)
        .where({ id, userId });
      if (update.reminderAt) {
        query.andWhere("status <> :done", { done: TodoStatus.DONE });
      }
      const result = await query.execute();
      if (result.affected === 0 && update.reminderAt) {
        const current = await this.owned(userId, id);
        if (current.status === TodoStatus.DONE) {
          throw new BadRequestException(
            "완료한 할 일에는 알림을 예약할 수 없어요.",
          );
        }
      }
    }
    return todoResponse(await this.owned(userId, id));
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
    await this.todos.remove(await this.owned(userId, id));
  }

  private async owned(userId: number, id: number): Promise<Todo> {
    const todo = await this.todos.findOneBy({ id, userId });
    if (!todo) {
      throw new NotFoundException(`할 일을 찾을 수 없습니다: ${id}`);
    }
    return todo;
  }
}

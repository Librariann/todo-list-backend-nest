import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Not, Repository } from "typeorm";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { PushService } from "./push.service";

interface ClaimedTodo {
  userId: number;
  name: string;
  targetDate: string;
}

@Injectable()
export class TodoReminderService {
  private readonly logger = new Logger(TodoReminderService.name);
  private running = false;

  constructor(
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    private readonly push: PushService,
  ) {}

  @Interval("todo-reminders", 60_000)
  async dispatchDueReminders(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const due = await this.todos.find({
        select: { id: true, reminderAt: true },
        where: {
          reminderAt: LessThanOrEqual(now),
          status: Not(TodoStatus.DONE),
        },
        order: { reminderAt: "ASC", id: "ASC" },
        take: 100,
      });

      for (const todo of due) {
        try {
          // Consume the reservation once, even if Expo's response is ambiguous.
          const result = await this.todos
            .createQueryBuilder()
            .update()
            .set({ reminderAt: null, updatedAt: () => "updated_at" })
            .where({ id: todo.id, reminderAt: todo.reminderAt })
            .andWhere("status <> :done", { done: TodoStatus.DONE })
            .returning(
              'user_id AS "userId", name, target_date::text AS "targetDate"',
            )
            .execute();
          const claimed = (result.raw as ClaimedTodo[])[0];
          if (!claimed) continue;

          await this.push.sendToUser(claimed.userId, {
            title: "할 일 알림이에요",
            body: claimed.name,
            type: "TODO_REMINDER",
            data: {
              screen: "todos",
              date: claimed.targetDate,
              todoId: todo.id,
            },
          });
        } catch (error) {
          this.logger.warn(
            `할 일 알림 발송 실패 todo=${todo.id}: ${String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`예약된 할 일 알림 확인 실패: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

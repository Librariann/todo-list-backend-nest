import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Not, Repository } from "typeorm";
import { NotificationPreference } from "../entities/notification-preference.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { PushService } from "./push.service";
import { calculateNextReminderAt, localClock } from "./reminder-time";

@Injectable()
export class DailyTodoReminderService {
  private readonly logger = new Logger(DailyTodoReminderService.name);
  private running = false;

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
    @InjectRepository(Todo)
    private readonly todos: Repository<Todo>,
    private readonly push: PushService,
  ) {}

  @Interval("daily-todo-reminders", 60_000)
  async dispatchDueReminders(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const preferences = await this.preferences.find({
        where: {
          pushEnabled: true,
          nextReminderAt: LessThanOrEqual(now),
        },
        order: { nextReminderAt: "ASC" },
        take: 100,
      });
      for (const preference of preferences) {
        try {
          await this.dispatchPreference(preference, now);
        } catch (error) {
          this.logger.warn(
            `일일 리마인더 발송 실패 user=${preference.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `일일 할 일 리마인더 확인 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchPreference(
    preference: NotificationPreference,
    now: Date,
  ): Promise<void> {
    const local = localClock(now, preference.timezone);

    const remainingTodos = await this.todos.countBy({
      userId: preference.userId,
      targetDate: local.date,
      status: Not(TodoStatus.DONE),
    });

    if (remainingTodos > 0) {
      const result = await this.push.sendToUser(preference.userId, {
        title: `오늘 할 일 ${remainingTodos}개가 남았어요`,
        body: "가볍게 하나씩 시작해볼까요?",
        type: "DAILY_TODO_REMINDER",
        data: { screen: "todos", date: local.date },
      });
      this.logger.log(
        `일일 리마인더 user=${preference.userId} date=${local.date} targeted=${result.targetedDevices} accepted=${result.accepted}`,
      );
    }

    preference.nextReminderAt = calculateNextReminderAt(
      now,
      preference.dailyReminderTime,
      preference.timezone,
    );
    await this.preferences.save(preference);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, LessThanOrEqual, Repository } from "typeorm";
import { Habit, HabitLog } from "../entities/habit.entity";
import {
  HABIT_REMINDER_TIMEZONE,
  nextHabitReminderAt,
} from "../habits/habit-reminder";
import { localClock } from "./reminder-time";
import { PushService } from "./push.service";

@Injectable()
export class HabitReminderService {
  private readonly logger = new Logger(HabitReminderService.name);
  private running = false;

  constructor(
    @InjectRepository(Habit) private readonly habits: Repository<Habit>,
    private readonly dataSource: DataSource,
    private readonly push: PushService,
  ) {}

  @Interval("habit-reminders", 60_000)
  async dispatchDueReminders(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.habits.find({
        select: { id: true },
        where: { isActive: true, nextReminderAt: LessThanOrEqual(now) },
        order: { nextReminderAt: "ASC", id: "ASC" },
        take: 100,
      });
      for (const { id } of due) {
        try {
          const claimed = await this.dataSource.transaction(async (manager) => {
            const habits = manager.getRepository(Habit);
            const habit = await habits.findOne({
              where: {
                id,
                isActive: true,
                nextReminderAt: LessThanOrEqual(now),
              },
              lock: { mode: "pessimistic_write", onLocked: "skip_locked" },
            });
            if (!habit?.nextReminderAt || !habit.reminderTime) return null;

            const date = localClock(now, HABIT_REMINDER_TIMEZONE).date;
            const scheduledDate = localClock(
              habit.nextReminderAt,
              HABIT_REMINDER_TIMEZONE,
            ).date;
            const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
            const shouldCheck =
              scheduledDate === date &&
              habit.reminderDays.includes(weekday) &&
              habit.lastReminderDate !== date;
            const log = shouldCheck
              ? await manager
                  .getRepository(HabitLog)
                  .findOneBy({
                    habitId: id,
                    userId: habit.userId,
                    logDate: date,
                  })
              : null;
            // Advance before sending so multiple workers or edits cannot resend today.
            const lastReminderDate = shouldCheck
              ? date
              : habit.lastReminderDate;
            await habits
              .createQueryBuilder()
              .update()
              .set({
                nextReminderAt: nextHabitReminderAt(
                  now,
                  habit.reminderTime,
                  habit.reminderDays,
                  lastReminderDate,
                ),
                lastReminderDate,
                updatedAt: () => "updated_at",
              })
              .where({ id })
              .execute();

            if (!shouldCheck || (log?.currentCount ?? 0) >= habit.dailyTarget)
              return null;
            return { userId: habit.userId, name: habit.name, date };
          });
          if (!claimed) continue;
          await this.push.sendToUser(claimed.userId, {
            title: "습관을 이어갈 시간이에요",
            body: `${claimed.name}, 오늘도 가볍게 실천해볼까요?`,
            type: "HABIT_REMINDER",
            data: { screen: "habits", date: claimed.date, habitId: id },
          });
        } catch (error) {
          this.logger.warn(`습관 알림 발송 실패 habit=${id}: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`예약된 습관 알림 확인 실패: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

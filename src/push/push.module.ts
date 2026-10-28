import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationPreference } from "../entities/notification-preference.entity";
import { PushDelivery } from "../entities/push-delivery.entity";
import { PushDevice } from "../entities/push-device.entity";
import { Todo } from "../entities/todo.entity";
import { Habit, HabitLog } from "../entities/habit.entity";
import {
  PushController,
  PushPreferencesController,
  PushTestController,
} from "./push.controller";
import { PushService } from "./push.service";
import { DailyTodoReminderService } from "./daily-todo-reminder.service";
import { TodoReminderService } from "./todo-reminder.service";
import { HabitReminderService } from "./habit-reminder.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushDevice,
      PushDelivery,
      NotificationPreference,
      Todo,
      Habit,
      HabitLog,
    ]),
  ],
  controllers: [PushController, PushPreferencesController, PushTestController],
  providers: [
    PushService,
    DailyTodoReminderService,
    TodoReminderService,
    HabitReminderService,
  ],
  exports: [PushService],
})
export class PushModule {}

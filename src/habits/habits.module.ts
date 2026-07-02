import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChallengesModule } from "../challenges/challenges.module";
import { Habit, HabitLog, HabitStreak } from "../entities/habit.entity";
import { HabitsController } from "./habits.controller";
import { HabitsService } from "./habits.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([Habit, HabitLog, HabitStreak]),
    ChallengesModule,
  ],
  controllers: [HabitsController],
  providers: [HabitsService],
})
export class HabitsModule {}

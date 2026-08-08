import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChallengesModule } from "../challenges/challenges.module";
import { Goal, GoalProcess, GoalStreak } from "../entities/goal.entity";
import { GoalsController } from "./goals.controller";
import { GoalsService } from "./goals.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([Goal, GoalProcess, GoalStreak]),
    ChallengesModule,
  ],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}

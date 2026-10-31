import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Goal, GoalProcess } from "../entities/goal.entity";
import { Habit, HabitLog } from "../entities/habit.entity";
import {
  Recommendation,
  RecommendationState,
} from "../entities/recommendation.entity";
import { Todo } from "../entities/todo.entity";
import { GoalsModule } from "../goals/goals.module";
import { HabitsModule } from "../habits/habits.module";
import { TodosModule } from "../todos/todos.module";
import { RecommendationContextService } from "./recommendation-context.service";
import { RecommendationAiClient } from "./recommendation-ai-client";
import { RecommendationsController } from "./recommendations.controller";
import { RecommendationsService } from "./recommendations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Recommendation,
      RecommendationState,
      Todo,
      Habit,
      HabitLog,
      Goal,
      GoalProcess,
    ]),
    TodosModule,
    HabitsModule,
    GoalsModule,
  ],
  providers: [
    RecommendationContextService,
    RecommendationAiClient,
    RecommendationsService,
  ],
  controllers: [RecommendationsController],
})
export class RecommendationsModule {}

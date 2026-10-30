import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, In, LessThanOrEqual, Repository } from "typeorm";
import { addDays, today } from "../common/date";
import { Goal, GoalProcess } from "../entities/goal.entity";
import { Habit, HabitLog } from "../entities/habit.entity";
import {
  Recommendation,
  RecommendationStatus,
} from "../entities/recommendation.entity";
import { Todo } from "../entities/todo.entity";
import type {
  ContextSource,
  RecommendationContext,
} from "./recommendation.types";

@Injectable()
export class RecommendationContextService {
  constructor(
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    @InjectRepository(Habit) private readonly habits: Repository<Habit>,
    @InjectRepository(HabitLog) private readonly logs: Repository<HabitLog>,
    @InjectRepository(Goal) private readonly goals: Repository<Goal>,
    @InjectRepository(GoalProcess)
    private readonly processes: Repository<GoalProcess>,
    @InjectRepository(Recommendation)
    private readonly recommendations: Repository<Recommendation>,
  ) {}

  async build(userId: number): Promise<RecommendationContext> {
    const date = today();
    const from = addDays(date, -29);
    const [todos, habits, goals, feedback] = await Promise.all([
      this.todos.find({
        where: { userId, targetDate: Between(from, date) },
        order: { targetDate: "DESC", id: "DESC" },
        take: 12,
      }),
      this.habits.find({
        where: { userId, isActive: true },
        order: { createdAt: "DESC" },
        take: 6,
      }),
      this.goals.find({
        where: { userId, isActive: true, startDate: LessThanOrEqual(date) },
        order: { createdAt: "DESC" },
        take: 6,
      }),
      this.recommendations.find({
        where: {
          userId,
          status: In([
            RecommendationStatus.ACCEPTED,
            RecommendationStatus.DISMISSED,
          ]),
        },
        order: { updatedAt: "DESC" },
        take: 6,
      }),
    ]);

    const [logs, processes] = await Promise.all([
      habits.length
        ? this.logs.find({
            where: {
              userId,
              habitId: In(habits.map((habit) => habit.id)),
              logDate: Between(from, date),
            },
            order: { logDate: "DESC" },
            take: 180,
          })
        : Promise.resolve([] as HabitLog[]),
      goals.length
        ? this.processes.find({
            where: {
              userId,
              goalId: In(goals.map((goal) => goal.id)),
              periodEnd: Between(from, date),
            },
            order: { periodEnd: "DESC" },
            take: 180,
          })
        : Promise.resolve([] as GoalProcess[]),
    ]);

    const sources: ContextSource[] = todos.map((todo) => ({
      sourceId: `todo:${todo.id}`,
      type: "todo",
      title: todo.name,
      facts: { targetDate: todo.targetDate, status: todo.status },
    }));

    for (const habit of habits) {
      const recorded = logs.filter(
        (log) => String(log.habitId) === String(habit.id),
      );
      const pastRecorded = recorded.filter((log) => log.logDate < date);
      sources.push({
        sourceId: `habit:${habit.id}`,
        type: "habit",
        title: habit.name,
        facts: {
          dailyTarget: habit.dailyTarget,
          unit: habit.unit,
          recordedDays: pastRecorded.length,
          achievedRecordedDays: pastRecorded.filter((log) => log.isAchieved)
            .length,
          recordedExecutions: recorded.reduce(
            (sum, log) => sum + log.currentCount,
            0,
          ),
        },
      });
    }

    for (const goal of goals) {
      // A current period is still in progress even when it ends today.
      const finished = processes.filter(
        (process) =>
          String(process.goalId) === String(goal.id) &&
          process.periodEnd < date,
      );
      sources.push({
        sourceId: `goal:${goal.id}`,
        type: "goal",
        title: goal.name,
        facts: {
          recurrenceType: goal.recurrenceType,
          targetCount: goal.targetCount,
          completedPeriods: finished.length,
          achievedPeriods: finished.filter((process) => process.isAchieved)
            .length,
        },
      });
    }

    const context: RecommendationContext = {
      today: date,
      from,
      sources,
      recentFeedback: feedback.map((item) => ({
        type: item.type,
        title: item.title,
        status: item.status,
      })),
    };
    // Reserve room for the prompt, schema and response on an 8K model server.
    while (
      JSON.stringify(context).length > 8000 &&
      context.sources.length > 3
    ) {
      const counts = { todo: 0, habit: 0, goal: 0 };
      for (const source of context.sources) counts[source.type] += 1;
      const largest = (Object.keys(counts) as (keyof typeof counts)[]).sort(
        (a, b) => counts[b] - counts[a],
      )[0];
      const index = context.sources.findLastIndex(
        (source) => source.type === largest,
      );
      context.sources.splice(index, 1);
    }
    return context;
  }
}

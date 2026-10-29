import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import {
  DataSource,
  EntityManager,
  MoreThanOrEqual,
  Repository,
} from "typeorm";
import { addDays, today } from "../common/date";
import { Goal } from "../entities/goal.entity";
import { Habit } from "../entities/habit.entity";
import {
  Recommendation,
  RecommendationState,
  RecommendationStatus,
} from "../entities/recommendation.entity";
import { Todo } from "../entities/todo.entity";
import { GoalsService } from "../goals/goals.service";
import { HabitsService } from "../habits/habits.service";
import { TodosService } from "../todos/todos.service";
import { RecommendationContextService } from "./recommendation-context.service";
import {
  boundedInteger,
  RecommendationAiClient,
} from "./recommendation-ai-client";
import { normalizeRecommendationTitle } from "./recommendation-policy";
import type {
  RecommendationList,
  RecommendationOutput,
  ValidRecommendation,
} from "./recommendation.types";

function output(item: Recommendation): RecommendationOutput {
  return {
    id: Number(item.id),
    type: item.type,
    title: item.title,
    reason: item.reason,
    payload: item.payload,
    status: item.status,
    createdItemId:
      item.createdItemId === null ? null : Number(item.createdItemId),
    createdAt: item.createdAt,
  };
}

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Recommendation)
    private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(RecommendationState)
    private readonly states: Repository<RecommendationState>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly context: RecommendationContextService,
    private readonly ai: RecommendationAiClient,
    private readonly todos: TodosService,
    private readonly habits: HabitsService,
    private readonly goals: GoalsService,
  ) {}

  private get cooldownSeconds(): number {
    return boundedInteger(
      this.config,
      "AI_RECOMMENDATIONS_COOLDOWN_SECONDS",
      300,
      5,
      86_400,
    );
  }

  private get dailyLimit(): number {
    return boundedInteger(
      this.config,
      "AI_RECOMMENDATIONS_DAILY_LIMIT",
      3,
      1,
      30,
    );
  }

  private retryAfter(
    state: RecommendationState | null,
    now = new Date(),
  ): number {
    if (!state) return 0;
    let until = Math.max(
      state.leaseUntil?.getTime() ?? 0,
      state.lastAttemptAt
        ? state.lastAttemptAt.getTime() + this.cooldownSeconds * 1000
        : 0,
    );
    if (state.generationDate === today() && state.attempts >= this.dailyLimit) {
      until = Math.max(
        until,
        new Date(`${addDays(today(), 1)}T00:00:00+09:00`).getTime(),
      );
    }
    return Math.max(0, Math.ceil((until - now.getTime()) / 1000));
  }

  async list(userId: number): Promise<RecommendationList> {
    const state = await this.states.findOneBy({ userId });
    const items = state?.latestGenerationId
      ? await this.recommendations.find({
          where: { userId, generationId: state.latestGenerationId },
          order: { id: "ASC" },
          take: 3,
        })
      : [];
    return {
      available: this.ai.available,
      items: items.map(output),
      message: !this.ai.available
        ? "추천 기능을 준비하고 있어요."
        : state?.leaseUntil && state.leaseUntil > new Date()
          ? "기록을 바탕으로 추천을 만들고 있어요."
          : null,
      retryAfterSeconds: this.retryAfter(state),
    };
  }

  async generate(userId: number): Promise<RecommendationList> {
    if (!this.ai.available)
      throw new ServiceUnavailableException("추천 기능을 준비하고 있어요.");
    const context = await this.context.build(userId);
    if (!context.sources.length) {
      return {
        available: true,
        items: [],
        message:
          "할 일이나 습관, 목표를 기록하면 나에게 맞는 추천을 받을 수 있어요.",
        retryAfterSeconds: 0,
      };
    }
    const token = randomUUID();
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, userId);
      const retry = this.retryAfter(state);
      if (retry > 0)
        throw new HttpException(
          state.generationDate === today() && state.attempts >= this.dailyLimit
            ? "오늘 받을 수 있는 추천을 모두 확인했어요. 내일 다시 찾아주세요."
            : "잠시 뒤에 새로운 추천을 받을 수 있어요.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const now = new Date();
      state.attempts =
        (state.generationDate === context.today ? state.attempts : 0) + 1;
      state.generationDate = context.today;
      state.lastAttemptAt = now;
      state.leaseToken = token;
      state.leaseUntil = new Date(now.getTime() + this.ai.timeoutMs + 30_000);
      await manager.getRepository(RecommendationState).save(state);
    });

    try {
      const candidates = await this.ai.generate(context);
      if (today() !== context.today)
        throw new ConflictException(
          "날짜가 바뀌었어요. 새로운 추천을 받아주세요.",
        );
      await this.dataSource.transaction(async (manager) => {
        const state = await this.lockState(manager, userId);
        if (state.leaseToken !== token)
          throw new ConflictException("새로운 추천을 다시 확인해 주세요.");
        const repository = manager.getRepository(Recommendation);
        const items: Recommendation[] = [];
        for (const candidate of candidates) {
          if (await this.isDuplicate(manager, userId, candidate)) continue;
          if (
            context.recentFeedback.some(
              (feedback) =>
                feedback.status === RecommendationStatus.DISMISSED &&
                feedback.type === candidate.type &&
                normalizeRecommendationTitle(feedback.title) ===
                  normalizeRecommendationTitle(candidate.title),
            )
          )
            continue;
          items.push(
            repository.create({
              ...candidate,
              userId,
              generationId: token,
              status: RecommendationStatus.PENDING,
              createdItemId: null,
            }),
          );
        }
        await repository.save(items);
        state.latestGenerationId = token;
        state.leaseToken = null;
        state.leaseUntil = null;
        await manager.getRepository(RecommendationState).save(state);
      });
      const result = await this.list(userId);
      if (!result.items.length)
        result.message =
          "지금 기록에서 새로운 추천을 찾지 못했어요. 기록을 더 쌓고 다시 만나봐요.";
      return result;
    } catch (error) {
      await this.states.update(
        { userId, leaseToken: token },
        { leaseToken: null, leaseUntil: null },
      );
      throw error;
    }
  }

  async accept(userId: number, id: number): Promise<RecommendationOutput> {
    return this.dataSource.transaction(async (manager) => {
      // The user row serializes selection across different recommendations, too.
      await this.lockState(manager, userId);
      const repository = manager.getRepository(Recommendation);
      const item = await repository.findOne({
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) throw new NotFoundException("추천을 찾을 수 없습니다.");
      if (item.status === RecommendationStatus.ACCEPTED) return output(item);
      if (item.status !== RecommendationStatus.PENDING)
        throw new ConflictException(
          "이미 닫은 추천이에요. 새로운 추천을 받아주세요.",
        );
      const date =
        item.type === "todo" ? item.payload.targetDate : item.payload.startDate;
      if (date && date < today())
        throw new ConflictException(
          "지난 날짜의 추천이에요. 새로운 추천을 받아주세요.",
        );
      if (await this.isDuplicate(manager, userId, item))
        throw new ConflictException("이미 같은 항목이 등록되어 있어요.");

      let createdId: number;
      if (item.type === "todo") {
        const created = await this.todos.create(
          userId,
          { name: item.title, targetDate: item.payload.targetDate! },
          manager,
        );
        createdId = created.id;
      } else if (item.type === "habit") {
        const created = await this.habits.create(
          userId,
          {
            name: item.title,
            dailyTarget: item.payload.dailyTarget!,
            unit: item.payload.unit,
          },
          manager,
        );
        createdId = created.id;
      } else {
        const created = await this.goals.create(
          userId,
          {
            name: item.title,
            recurrenceType: item.payload.recurrenceType!,
            interval: item.payload.interval!,
            startDate: item.payload.startDate!,
            targetCount: item.payload.targetCount!,
          },
          manager,
        );
        createdId = created.id;
      }
      item.status = RecommendationStatus.ACCEPTED;
      item.createdItemId = createdId;
      return output(await repository.save(item));
    });
  }

  async dismiss(userId: number, id: number): Promise<RecommendationOutput> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockState(manager, userId);
      const repository = manager.getRepository(Recommendation);
      const item = await repository.findOne({
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) throw new NotFoundException("추천을 찾을 수 없습니다.");
      if (item.status === RecommendationStatus.ACCEPTED)
        throw new ConflictException("이미 등록한 추천이에요.");
      item.status = RecommendationStatus.DISMISSED;
      return output(await repository.save(item));
    });
  }

  private async lockState(
    manager: EntityManager,
    userId: number,
  ): Promise<RecommendationState> {
    const repository = manager.getRepository(RecommendationState);
    await repository
      .createQueryBuilder()
      .insert()
      .values({ userId, attempts: 0 })
      .orIgnore()
      .execute();
    return repository.findOneOrFail({
      where: { userId },
      lock: { mode: "pessimistic_write" },
    });
  }

  private async isDuplicate(
    manager: EntityManager,
    userId: number,
    candidate: Pick<ValidRecommendation, "type" | "title" | "payload">,
  ): Promise<boolean> {
    const title = normalizeRecommendationTitle(candidate.title);
    if (candidate.type === "todo") {
      const items = await manager.getRepository(Todo).find({
        select: { name: true },
        where: { userId, targetDate: MoreThanOrEqual(today()) },
      });
      return items.some(
        (item) => normalizeRecommendationTitle(item.name) === title,
      );
    }
    if (candidate.type === "habit") {
      const items = await manager
        .getRepository(Habit)
        .find({ select: { name: true }, where: { userId, isActive: true } });
      return items.some(
        (item) => normalizeRecommendationTitle(item.name) === title,
      );
    }
    const items = await manager
      .getRepository(Goal)
      .find({ select: { name: true }, where: { userId, isActive: true } });
    return items.some(
      (item) => normalizeRecommendationTitle(item.name) === title,
    );
  }
}

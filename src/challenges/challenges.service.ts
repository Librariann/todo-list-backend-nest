import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { periodKey, PeriodType } from "../common/date";
import {
  Challenge,
  UserProgressChallenge,
  WorkType,
} from "../entities/challenge.entity";
import { PointsService } from "../points/points.service";
import type { CreateChallengeDto } from "./dto/create-challenges.dto";
import type { UpdateChallengeDto } from "./dto/update-challenges.dto";

export interface ChallengeOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string | null;
  icon: string | null;
  recurrenceType: PeriodType;
  targetCount: number;
  point: number;
  isActive: boolean;
}

export interface ChallengeProgressOutput extends ChallengeOutput {
  currentCount: number;
  isAchieved: boolean;
  periodType: PeriodType;
  periodKey: string;
}

export function challengeResponse(challenge: Challenge): ChallengeOutput {
  return {
    id: challenge.id,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    name: challenge.name,
    description: challenge.description,
    icon: challenge.icon,
    recurrenceType: challenge.recurrenceType,
    targetCount: challenge.targetCount,
    point: challenge.point,
    isActive: challenge.isActive,
  };
}
export function progressResponse(
  progress: UserProgressChallenge,
): ChallengeProgressOutput {
  return {
    id: progress.id,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
    name: progress.challenge.name,
    description: progress.challenge.description,
    icon: progress.challenge.icon,
    recurrenceType: progress.challenge.recurrenceType,
    targetCount: progress.challenge.targetCount,
    point: progress.challenge.point,
    isActive: progress.challenge.isActive,
    currentCount: progress.currentCount,
    isAchieved: progress.isAchieved,
    periodType: progress.periodType,
    periodKey: progress.periodKey,
  };
}

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,

    @InjectRepository(UserProgressChallenge)
    private readonly progresses: Repository<UserProgressChallenge>,

    private readonly points: PointsService,
  ) {}

  async list(): Promise<ChallengeOutput[]> {
    const challenges = await this.challenges.findBy({ isActive: true });
    const result = challenges.map((challenge) => challengeResponse(challenge));

    return result;
  }

  async create(dto: CreateChallengeDto): Promise<ChallengeOutput> {
    const exists = await this.challenges.exists({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(
        `이미 사용중인 도전과제명 입니다: ${dto.name}`,
      );
    }

    return challengeResponse(
      await this.challenges.save(this.challenges.create(dto)),
    );
  }

  async update(id: number, dto: UpdateChallengeDto): Promise<ChallengeOutput> {
    const item = await this.challenges.findOneBy({ id, isActive: true });

    if (!item) {
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    }

    Object.assign(item, dto);
    return challengeResponse(await this.challenges.save(item));
  }

  async remove(id: number): Promise<ChallengeOutput> {
    const item = await this.challenges.findOneBy({ id });
    if (!item) {
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    }
    item.isActive = false;
    return challengeResponse(await this.challenges.save(item));
  }

  async withProgress(userId: number): Promise<ChallengeProgressOutput[]> {
    const active = await this.challenges.findBy({ isActive: true });

    const keys = [
      periodKey(PeriodType.DAILY),
      periodKey(PeriodType.WEEKLY),
      periodKey(PeriodType.MONTHLY),
    ];

    const progress = await this.progresses.find({
      where: { userId, periodKey: In(keys) },
      relations: { challenge: true },
    });

    const map = new Map(
      progress.map((progress) => [Number(progress.challengeId), progress]),
    );
    const result = active.map((active) => {
      const getId = map.get(Number(active.id));
      return {
        ...challengeResponse(active),
        currentCount: getId?.currentCount ?? 0,
        isAchieved: getId?.isAchieved ?? false,
        periodType: getId?.periodType ?? active.recurrenceType,
        periodKey: getId?.periodKey ?? periodKey(active.recurrenceType),
      };
    });

    return result;
  }

  async achieved(userId: number): Promise<ChallengeProgressOutput[]> {
    const progresses = await this.progresses.find({
      where: { userId, isAchieved: true },
      relations: { challenge: true },
      order: { createdAt: "DESC" },
    });

    const result = progresses.map(progressResponse);
    return result;
  }

  async record(userId: number, workType: WorkType): Promise<void> {
    const items = await this.challenges.findBy({ workType, isActive: true });
    for (const challenge of items) {
      const key = periodKey(challenge.recurrenceType);
      let progress = await this.progresses.findOne({
        where: {
          userId,
          challengeId: challenge.id,
          periodType: challenge.recurrenceType,
          periodKey: key,
        },
      });

      if (!progress) {
        progress = this.progresses.create({
          userId,
          challengeId: challenge.id,
          periodType: challenge.recurrenceType,
          periodKey: key,
          currentCount: 0,
          isAchieved: false,
        });
      }

      //달성이 완료 됐거나 일일 최대 횟수를 초과하면 기록하지 않음
      if (
        progress.isAchieved ||
        progress.currentCount + 1 > challenge.dailyMaxCount
      ) {
        continue;
      }

      progress.currentCount += 1;

      // 달성 완료 시 포인트 지급, 완료여부 true로 변경
      if (progress.currentCount >= challenge.targetCount) {
        progress.isAchieved = true;
        await this.points.awardChallenge(
          userId,
          challenge.point,
          challenge.id,
          challenge.recurrenceType,
        );
      }

      await this.progresses.save(progress);
    }
  }
}

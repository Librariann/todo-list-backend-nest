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

export function challengeResponse(c: Challenge) {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    name: c.name,
    description: c.description,
    icon: c.icon,
    recurrenceType: c.recurrenceType,
    targetCount: c.targetCount,
    point: c.point,
    isActive: c.isActive,
  };
}
export function progressResponse(p: UserProgressChallenge) {
  return {
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    name: p.challenge.name,
    description: p.challenge.description,
    icon: p.challenge.icon,
    recurrenceType: p.challenge.recurrenceType,
    targetCount: p.challenge.targetCount,
    point: p.challenge.point,
    isActive: p.challenge.isActive,
    currentCount: p.currentCount,
    isAchieved: p.isAchieved,
    periodType: p.periodType,
    periodKey: p.periodKey,
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
  async list() {
    return (await this.challenges.findBy({ isActive: true })).map(
      challengeResponse,
    );
  }
  async create(dto: Partial<Challenge>) {
    if (await this.challenges.exists({ where: { name: dto.name } }))
      throw new ConflictException(`이미 사용중인 보상명 입니다: ${dto.name}`);
    return challengeResponse(
      await this.challenges.save(this.challenges.create(dto)),
    );
  }
  async update(id: number, dto: Partial<Challenge>) {
    const item = await this.challenges.findOneBy({ id, isActive: true });
    if (!item)
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    Object.assign(item, dto);
    return challengeResponse(await this.challenges.save(item));
  }
  async remove(id: number) {
    const item = await this.challenges.findOneBy({ id });
    if (!item)
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    item.isActive = false;
    return challengeResponse(await this.challenges.save(item));
  }
  async withProgress(userId: number) {
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
    const map = new Map(progress.map((p) => [Number(p.challengeId), p]));
    return active.map((c) => {
      const p = map.get(Number(c.id));
      return {
        ...challengeResponse(c),
        currentCount: p?.currentCount ?? 0,
        isAchieved: p?.isAchieved ?? false,
        periodKey: p?.periodKey ?? periodKey(c.recurrenceType),
      };
    });
  }
  async achieved(userId: number) {
    return (
      await this.progresses.find({
        where: { userId, isAchieved: true },
        relations: { challenge: true },
        order: { createdAt: "DESC" },
      })
    ).map(progressResponse);
  }
  async record(userId: number, workType: WorkType): Promise<void> {
    const items = await this.challenges.findBy({ workType, isActive: true });
    for (const challenge of items) {
      const key = periodKey(challenge.recurrenceType);
      let p = await this.progresses.findOne({
        where: {
          userId,
          challengeId: challenge.id,
          periodType: challenge.recurrenceType,
          periodKey: key,
        },
      });
      if (!p)
        p = this.progresses.create({
          userId,
          challengeId: challenge.id,
          periodType: challenge.recurrenceType,
          periodKey: key,
          currentCount: 0,
          isAchieved: false,
        });
      if (p.isAchieved || p.currentCount + 1 > challenge.dailyMaxCount)
        continue;
      p.currentCount += 1;
      if (p.currentCount >= challenge.targetCount) {
        p.isAchieved = true;
        await this.points.awardChallenge(
          userId,
          challenge.point,
          challenge.id,
          challenge.recurrenceType,
        );
      }
      await this.progresses.save(p);
    }
  }
}

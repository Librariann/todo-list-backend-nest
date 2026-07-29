import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { periodKey, PeriodType } from "../common/date";
import {
  PointAction,
  PointMetaType,
  PointReason,
  UserPoint,
} from "../entities/user-point.entity";
import { User } from "../entities/user.entity";

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(UserPoint) private readonly points: Repository<UserPoint>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}
  async total(userId: number): Promise<number> {
    const row = await this.points
      .createQueryBuilder("p")
      .select(
        "COALESCE(SUM(CASE WHEN p.action = 'CREDIT' THEN p.point ELSE -p.point END), 0)",
        "total",
      )
      .where("p.user_id = :userId", { userId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }
  async awardChallenge(
    userId: number,
    point: number,
    challengeId: number,
    type: PeriodType,
    manager?: EntityManager,
    key = periodKey(type),
  ): Promise<void> {
    const points = manager?.getRepository(UserPoint) ?? this.points;
    const balance = await this.challengeRewardBalance(
      userId,
      challengeId,
      type,
      key,
      points,
    );
    const credit = point - balance;
    if (credit <= 0) return;

    await points.save(
      points.create({
        userId,
        action: PointAction.CREDIT,
        reason: PointReason.CHALLENGE,
        metaType: PointMetaType.CHALLENGE,
        metaId: challengeId,
        periodType: type,
        periodKey: key,
        point: credit,
      }),
    );
  }

  async revokeChallenge(
    userId: number,
    challengeId: number,
    type: PeriodType,
    key: string,
    manager?: EntityManager,
  ): Promise<void> {
    const points = manager?.getRepository(UserPoint) ?? this.points;
    const balance = await this.challengeRewardBalance(
      userId,
      challengeId,
      type,
      key,
      points,
    );
    if (balance <= 0) return;

    await points.save(
      points.create({
        userId,
        action: PointAction.DEBIT,
        reason: PointReason.CHALLENGE_REVERSAL,
        metaType: PointMetaType.CHALLENGE,
        metaId: challengeId,
        periodType: type,
        periodKey: key,
        point: balance,
      }),
    );
  }

  private async challengeRewardBalance(
    userId: number,
    challengeId: number,
    type: PeriodType,
    key: string,
    points: Repository<UserPoint>,
  ): Promise<number> {
    const row = await points
      .createQueryBuilder("p")
      .select(
        "COALESCE(SUM(CASE WHEN p.action = :credit THEN p.point ELSE -p.point END), 0)",
        "balance",
      )
      .where("p.user_id = :userId", { userId })
      .andWhere("p.meta_type = :metaType", {
        metaType: PointMetaType.CHALLENGE,
      })
      .andWhere("p.meta_id = :challengeId", { challengeId })
      .andWhere("p.period_type = :type", { type })
      .andWhere("p.period_key = :key", { key })
      .setParameter("credit", PointAction.CREDIT)
      .getRawOne<{ balance: string }>();

    return Number(row?.balance ?? 0);
  }
  async debitReward(
    userId: number,
    point: number,
    rewardId: number,
  ): Promise<void> {
    await this.points.save(
      this.points.create({
        userId,
        action: PointAction.DEBIT,
        reason: PointReason.SPEND,
        metaType: PointMetaType.STORE,
        metaId: rewardId,
        periodType: null,
        periodKey: null,
        point,
      }),
    );
  }
  async adjust(targetId: number, point: number): Promise<number> {
    const userExists = await this.users.exists({ where: { id: targetId } });

    if (!userExists) {
      throw new NotFoundException("해당 사용자를 찾을 수 없습니다.");
    }

    await this.points.save(
      this.points.create({
        userId: targetId,
        action: PointAction.CREDIT,
        reason: PointReason.ADJUST,
        metaType: PointMetaType.ADMIN,
        metaId: null,
        periodType: PeriodType.DAILY,
        periodKey: periodKey(PeriodType.DAILY),
        point,
      }),
    );
    return this.total(targetId);
  }
}

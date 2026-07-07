import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
  ): Promise<void> {
    await this.points.save(
      this.points.create({
        userId,
        action: PointAction.CREDIT,
        reason: PointReason.CHALLENGE,
        metaType: PointMetaType.CHALLENGE,
        metaId: challengeId,
        periodType: type,
        periodKey: periodKey(type),
        point,
      }),
    );
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
    if (!(await this.users.exists({ where: { id: targetId } })))
      throw new NotFoundException("해당 사용자를 찾을 수 없습니다.");
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

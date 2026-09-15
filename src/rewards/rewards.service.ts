import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  RewardRedemption,
  RewardRedemptionStatus,
} from "../entities/reward-redemption.entity";
import { Reward, RewardType, UserReward } from "../entities/reward.entity";
import { User } from "../entities/user.entity";
import { PointsService } from "../points/points.service";
import type { CreateRewardDto } from "./dto/create-rewards.dto";
import type { UpdateRewardDto } from "./dto/update-rewards.dto";

export interface RewardOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  type: RewardType;
  point: number;
  description: string;
  discount: boolean;
  discountRate: number;
  isActive: boolean;
}

export interface UserRewardOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  type: RewardType;
  point: number;
  description: string;
  discount: boolean;
  discountRate: number;
  isUsed: boolean;
}

function rewardResponse(reward: Reward): RewardOutput {
  return {
    id: reward.id,
    createdAt: reward.createdAt,
    updatedAt: reward.updatedAt,
    name: reward.name,
    type: reward.type,
    point: reward.point,
    description: reward.description,
    discount: reward.discount,
    discountRate: reward.discountRate,
    isActive: reward.isActive,
  };
}

function userRewardResponse(reward: UserReward): UserRewardOutput {
  return {
    id: reward.id,
    createdAt: reward.createdAt,
    updatedAt: reward.updatedAt,
    name: reward.rewardName,
    type: reward.rewardType,
    point: reward.rewardPoint,
    description: reward.rewardDescription,
    discount: reward.discount,
    discountRate: reward.discountRate,
    isUsed: reward.isUsed,
  };
}

export function rewardPurchasePoint(
  reward: Pick<Reward, "point" | "discount" | "discountRate">,
): number {
  if (!reward.discount) return reward.point;
  const discountRate = Math.min(100, Math.max(0, reward.discountRate));
  return Math.floor((reward.point * (100 - discountRate)) / 100);
}

@Injectable()
export class RewardsService {
  constructor(
    @InjectRepository(Reward) private readonly rewards: Repository<Reward>,
    @InjectRepository(UserReward)
    private readonly owned: Repository<UserReward>,
    private readonly points: PointsService,
    private readonly dataSource: DataSource,
  ) {}
  async list(): Promise<RewardOutput[]> {
    return (await this.rewards.findBy({ isActive: true })).map(rewardResponse);
  }
  async get(id: number): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id, isActive: true });
    if (!reward) {
      throw new NotFoundException("보상을 찾을 수 없습니다.");
    }

    return rewardResponse(reward);
  }
  async create(dto: CreateRewardDto): Promise<RewardOutput> {
    const rewardExists = await this.rewards.exists({
      where: { name: dto.name },
    });
    if (rewardExists) {
      throw new ConflictException(`이미 사용중인 보상명 입니다: ${dto.name}`);
    }
    const rewardSave = await this.rewards.save(this.rewards.create(dto));

    return rewardResponse(rewardSave);
  }
  async update(id: number, dto: UpdateRewardDto): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id, isActive: true });
    if (!reward) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    }
    Object.assign(reward, dto);
    const rewardSave = await this.rewards.save(reward);

    return rewardResponse(rewardSave);
  }

  async remove(id: number): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id });
    if (!reward) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    }
    reward.isActive = false;
    const rewardSave = await this.rewards.save(reward);

    return rewardResponse(rewardSave);
  }

  async userList(userId: number): Promise<UserRewardOutput[]> {
    return (
      await this.owned.find({ where: { userId }, order: { createdAt: "DESC" } })
    ).map(userRewardResponse);
  }

  async redeem(
    userId: number,
    rewardId: number,
    idempotencyKey: string,
  ): Promise<UserRewardOutput> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!user) {
        throw new NotFoundException(`사용자를 찾을 수 없습니다: ${userId}`);
      }

      const redemptions = manager.getRepository(RewardRedemption);
      const existing = await redemptions.findOneBy({
        userId,
        idempotencyKey,
      });

      if (existing && existing.rewardId !== rewardId) {
        throw new ConflictException(
          "이미 다른 보상 교환에 사용된 요청 키입니다.",
        );
      }

      if (existing) {
        return this.findExistingRedemptionResult(existing, manager);
      }

      const reward = await manager.getRepository(Reward).findOneBy({
        id: rewardId,
        isActive: true,
      });

      if (!reward) {
        throw new NotFoundException(`보상을 찾을 수 없습니다: ${rewardId}`);
      }

      const purchasePoint = rewardPurchasePoint(reward);
      const totalPoint = await this.points.total(userId, manager);

      if (totalPoint < purchasePoint) {
        throw new BadRequestException("보상을 구매할 포인트가 부족합니다.");
      }

      const redemption = await redemptions.save(
        redemptions.create({
          userId,
          rewardId,
          idempotencyKey,
          point: purchasePoint,
          status: RewardRedemptionStatus.PENDING,
          userRewardId: null,
        }),
      );

      await this.points.debitReward(
        userId,
        purchasePoint,
        redemption.id,
        manager,
      );

      const owned = manager.getRepository(UserReward);
      const item = await owned.save(
        owned.create({
          userId,
          rewardId,
          rewardName: reward.name,
          rewardType: reward.type,
          rewardPoint: purchasePoint,
          rewardDescription: reward.description,
          discount: reward.discount,
          discountRate: reward.discountRate,
          isUsed: false,
        }),
      );

      redemption.userRewardId = item.id;
      redemption.status = RewardRedemptionStatus.COMPLETED;
      await redemptions.save(redemption);

      return userRewardResponse(item);
    });
  }

  private async findExistingRedemptionResult(
    redemption: RewardRedemption,
    manager: EntityManager,
  ): Promise<UserRewardOutput> {
    if (
      redemption.status !== RewardRedemptionStatus.COMPLETED ||
      !redemption.userRewardId
    ) {
      throw new ConflictException("보상 교환이 처리 중입니다.");
    }

    const item = await manager.getRepository(UserReward).findOneBy({
      id: redemption.userRewardId,
      userId: redemption.userId,
    });

    if (!item) {
      throw new ConflictException("기존 보상 교환 결과를 찾을 수 없습니다.");
    }

    return userRewardResponse(item);
  }

  async use(userId: number, id: number): Promise<UserRewardOutput> {
    const item = await this.owned.findOneBy({ id, userId });

    if (!item) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    }

    if (item.isUsed) {
      throw new BadRequestException("이미 사용된 보상입니다.");
    }

    item.isUsed = true;

    return userRewardResponse(await this.owned.save(item));
  }
}

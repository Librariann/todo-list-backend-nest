import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import {
  RewardRedemption,
  RewardRedemptionStatus,
} from "../entities/reward-redemption.entity";
import { Reward, RewardType, UserReward } from "../entities/reward.entity";
import { User } from "../entities/user.entity";
import { PointsService } from "../points/points.service";
import type { CreateRewardDto } from "./dto/create-rewards.dto";
import type { ReorderRewardsDto } from "./dto/reorder-rewards.dto";
import type { UpdateRewardDto } from "./dto/update-rewards.dto";
import { RewardCouponsService } from "./reward-coupons.service";

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
  imageUrl: string | null;
  availableFrom: Date | null;
  exchangeEnabled: boolean;
  stockQuantity: number;
  sortOrder: number;
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
  imageUrl: string | null;
  couponCode: string | null;
  couponImageUrl: string | null;
  expiresAt: Date | null;
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
    imageUrl: reward.imageUrl,
    availableFrom: reward.availableFrom,
    exchangeEnabled: reward.exchangeEnabled,
    stockQuantity: reward.stockQuantity,
    sortOrder: reward.sortOrder,
  };
}

export type UserRewardSummaryOutput = Omit<
  UserRewardOutput,
  "couponCode" | "couponImageUrl" | "expiresAt"
>;

function userRewardSnapshot(reward: UserReward): UserRewardSummaryOutput {
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
    imageUrl: reward.rewardImageUrl,
  };
}

function userRewardResponse(reward: UserReward): UserRewardOutput {
  return {
    ...userRewardSnapshot(reward),
    couponCode: null,
    couponImageUrl: null,
    expiresAt: null,
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
    private readonly coupons: RewardCouponsService,
  ) {}
  async list(): Promise<RewardOutput[]> {
    const result = await this.rewards.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return this.rewardOutputs(result);
  }

  async reorder(dto: ReorderRewardsDto): Promise<RewardOutput[]> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCatalogOrder(manager);
      const rewards = manager.getRepository(Reward);
      // Lock in a fixed order so simultaneous reorders serialize consistently.
      const activeRewards = await rewards
        .createQueryBuilder("reward")
        .where("reward.isActive = :isActive", { isActive: true })
        .orderBy("reward.id", "ASC")
        .setLock("pessimistic_write")
        .getMany();
      const activeIds = new Set(
        activeRewards.map((reward) => Number(reward.id)),
      );
      const { rewardIds } = dto;
      if (
        rewardIds.length !== activeIds.size ||
        new Set(rewardIds).size !== rewardIds.length ||
        rewardIds.some((id) => !activeIds.has(id))
      ) {
        throw new ConflictException(
          "보상 목록이 변경되었습니다. 목록을 새로고침한 후 다시 정렬해 주세요.",
        );
      }

      for (const [index, id] of rewardIds.entries()) {
        // Never save a full entity here: coupon stock belongs to redemption.
        await rewards.update({ id }, { sortOrder: index + 1 });
      }
      const result = await rewards.find({
        where: { id: In(rewardIds) },
        order: { sortOrder: "ASC", id: "ASC" },
      });
      return this.rewardOutputs(result, manager);
    });
  }
  async get(id: number): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id, isActive: true });
    if (!reward) {
      throw new NotFoundException("보상을 찾을 수 없습니다.");
    }

    return (await this.rewardOutputs([reward]))[0];
  }

  async create(dto: CreateRewardDto): Promise<RewardOutput> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCatalogOrder(manager);
      const rewards = manager.getRepository(Reward);
      const rewardExists = await rewards.exists({
        where: { name: dto.name },
      });
      if (rewardExists) {
        throw new ConflictException(`이미 사용중인 보상명 입니다: ${dto.name}`);
      }
      const sortOrder = (await rewards.maximum("sortOrder")) ?? 0;
      const { availableFrom, imageUrl, ...values } = dto;
      const result = await rewards.save(
        rewards.create({
          ...values,
          type: values.type ?? RewardType.COUPON,
          imageUrl: imageUrl?.trim() || null,
          availableFrom: availableFrom ? new Date(availableFrom) : null,
          sortOrder: sortOrder + 1,
          stockQuantity:
            (values.type ?? RewardType.COUPON) === RewardType.COUPON
              ? 0
              : (values.stockQuantity ?? 0),
        }),
      );

      return (await this.rewardOutputs([result], manager))[0];
    });
  }

  private async lockCatalogOrder(manager: EntityManager): Promise<void> {
    // Serialize append and reorder before reading positions or taking row locks.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      "rewards:catalog-order",
    ]);
  }

  async update(id: number, dto: UpdateRewardDto): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id, isActive: true });
    if (!reward) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    }

    const { imageUrl, availableFrom, ...values } = dto;
    const changes: Partial<Reward> = { ...values };
    if ((dto.type ?? reward.type) === RewardType.COUPON)
      delete changes.stockQuantity;

    if ("imageUrl" in dto) {
      changes.imageUrl = imageUrl?.trim() || null;
    }

    if ("availableFrom" in dto) {
      changes.availableFrom = availableFrom ? new Date(availableFrom) : null;
    }

    if (Object.values(changes).some((value) => value !== undefined)) {
      await this.rewards.update({ id }, changes);
    }
    const result = await this.rewards.findOneByOrFail({ id });
    return (await this.rewardOutputs([result]))[0];
  }

  async remove(id: number): Promise<RewardOutput> {
    const reward = await this.rewards.findOneBy({ id });

    if (!reward) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    }

    await this.rewards.update({ id }, { isActive: false });
    const result = await this.rewards.findOneByOrFail({ id });
    return (await this.rewardOutputs([result]))[0];
  }

  async userList(userId: number): Promise<UserRewardOutput[]> {
    const items = await this.owned.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    const coupons = await this.coupons.ownerDetails(
      userId,
      items.map((item) => item.id),
    );
    return items.map((item) => ({
      ...userRewardResponse(item),
      ...coupons.get(Number(item.id)),
    }));
  }

  async userSummaryList(userId: number): Promise<UserRewardSummaryOutput[]> {
    const items = await this.owned.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    return items.map(userRewardSnapshot);
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

      if (existing && Number(existing.rewardId) !== Number(rewardId)) {
        throw new ConflictException(
          "이미 다른 보상 교환에 사용된 요청 키입니다.",
        );
      }

      if (existing) {
        return this.findExistingRedemptionResult(existing, manager);
      }

      const rewards = manager.getRepository(Reward);
      const reward = await rewards.findOne({
        where: { id: rewardId, isActive: true },
        lock: { mode: "pessimistic_write" },
      });

      if (!reward) {
        throw new NotFoundException(`보상을 찾을 수 없습니다: ${rewardId}`);
      }

      if (!reward.exchangeEnabled) {
        throw new BadRequestException("현재 교환이 잠시 중단된 보상입니다.");
      }

      if (reward.availableFrom && reward.availableFrom > new Date()) {
        throw new BadRequestException("아직 교환이 시작되지 않은 보상입니다.");
      }

      const coupon =
        reward.type === RewardType.COUPON
          ? await this.coupons.reserve(manager, rewardId)
          : null;

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
          rewardImageUrl: reward.imageUrl,
        }),
      );

      const couponDetails = coupon
        ? await this.coupons.assign(manager, coupon, userId, item.id)
        : null;

      redemption.userRewardId = item.id;
      redemption.status = RewardRedemptionStatus.COMPLETED;
      await redemptions.save(redemption);

      return { ...userRewardResponse(item), ...couponDetails };
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

    const coupons = await this.coupons.ownerDetails(
      redemption.userId,
      [item.id],
      manager,
    );
    return { ...userRewardResponse(item), ...coupons.get(Number(item.id)) };
  }

  async use(userId: number, id: number): Promise<UserRewardOutput> {
    return this.dataSource.transaction(async (manager) => {
      const owned = manager.getRepository(UserReward);
      const item = await owned.findOne({
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
      if (item.isUsed) throw new BadRequestException("이미 사용된 보상입니다.");
      await this.coupons.markUsed(manager, userId, id);
      await owned.update({ id, userId }, { isUsed: true });
      const coupons = await this.coupons.ownerDetails(userId, [id], manager);
      return {
        ...userRewardResponse({ ...item, isUsed: true }),
        ...coupons.get(Number(id)),
      };
    });
  }

  private async rewardOutputs(
    rewards: Reward[],
    manager?: EntityManager,
  ): Promise<RewardOutput[]> {
    const counts = await this.coupons.availableCounts(
      rewards
        .filter((reward) => reward.type === RewardType.COUPON)
        .map((reward) => reward.id),
      manager,
    );
    return rewards.map((reward) => ({
      ...rewardResponse(reward),
      stockQuantity:
        reward.type === RewardType.COUPON
          ? (counts.get(Number(reward.id)) ?? 0)
          : reward.stockQuantity,
    }));
  }
}

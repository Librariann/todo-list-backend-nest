import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Reward, RewardType, UserReward } from "../entities/reward.entity";
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
@Injectable()
export class RewardsService {
  constructor(
    @InjectRepository(Reward) private readonly rewards: Repository<Reward>,
    @InjectRepository(UserReward)
    private readonly owned: Repository<UserReward>,
    private readonly points: PointsService,
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
  async redeem(userId: number, rewardId: number): Promise<UserRewardOutput> {
    const reward = await this.rewards.findOneBy({
      id: rewardId,
      isActive: true,
    });

    if (!reward) {
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${rewardId}`);
    }

    if ((await this.points.total(userId)) < reward.point) {
      throw new BadRequestException("보상을 구매할 포인트가 부족합니다.");
    }

    const item = await this.owned.save(
      this.owned.create({
        userId,
        rewardId,
        rewardName: reward.name,
        rewardType: reward.type,
        rewardPoint: reward.point,
        rewardDescription: reward.description,
        discount: reward.discount,
        discountRate: reward.discountRate,
        isUsed: false,
      }),
    );
    await this.points.debitReward(userId, reward.point, rewardId);

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

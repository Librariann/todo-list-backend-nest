import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Reward, UserReward } from "../entities/reward.entity";
import { PointsService } from "../points/points.service";
function rewardResponse(r: Reward) {
  return r;
}
function userRewardResponse(r: UserReward) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.rewardName,
    type: r.rewardType,
    point: r.rewardPoint,
    description: r.rewardDescription,
    discount: r.discount,
    discountRate: r.discountRate,
    isUsed: r.isUsed,
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
  async list() {
    return (await this.rewards.findBy({ isActive: true })).map(rewardResponse);
  }
  async get(id: number) {
    const r = await this.rewards.findOneBy({ id, isActive: true });
    if (!r) throw new NotFoundException("보상을 찾을 수 없습니다.");
    return rewardResponse(r);
  }
  async create(dto: Partial<Reward>) {
    if (await this.rewards.exists({ where: { name: dto.name } }))
      throw new ConflictException(`이미 사용중인 보상명 입니다: ${dto.name}`);
    return rewardResponse(await this.rewards.save(this.rewards.create(dto)));
  }
  async update(id: number, dto: Partial<Reward>) {
    const r = await this.rewards.findOneBy({ id, isActive: true });
    if (!r) throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    Object.assign(r, dto);
    return rewardResponse(await this.rewards.save(r));
  }
  async remove(id: number) {
    const r = await this.rewards.findOneBy({ id });
    if (!r) throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    r.isActive = false;
    return rewardResponse(await this.rewards.save(r));
  }
  async userList(userId: number) {
    return (
      await this.owned.find({ where: { userId }, order: { createdAt: "DESC" } })
    ).map(userRewardResponse);
  }
  async redeem(userId: number, rewardId: number) {
    const reward = await this.rewards.findOneBy({
      id: rewardId,
      isActive: true,
    });
    if (!reward)
      throw new NotFoundException(`보상을 찾을 수 없습니다: ${rewardId}`);
    if ((await this.points.total(userId)) < reward.point)
      throw new BadRequestException("보상을 구매할 포인트가 부족합니다.");
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
  async use(userId: number, id: number) {
    const item = await this.owned.findOneBy({ id, userId });
    if (!item) throw new NotFoundException(`보상을 찾을 수 없습니다: ${id}`);
    if (item.isUsed) throw new BadRequestException("이미 사용된 보상입니다.");
    item.isUsed = true;
    return userRewardResponse(await this.owned.save(item));
  }
}

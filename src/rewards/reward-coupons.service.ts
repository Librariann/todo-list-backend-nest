import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, IsNull, Repository } from "typeorm";
import {
  CouponProvider,
  RewardCoupon,
  RewardCouponStatus,
} from "../entities/reward-coupon.entity";
import { Reward, RewardType, UserReward } from "../entities/reward.entity";
import { CouponCryptoService } from "./coupon-crypto.service";
import { CouponStorageService } from "./coupon-storage.service";
import { CreateRewardCouponDto } from "./dto/create-reward-coupon.dto";
import { UpdateRewardCouponStatusDto } from "./dto/update-reward-coupon-status.dto";

export const COUPON_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface CouponImageUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface CouponInventoryOutput {
  id: number;
  rewardId: number;
  provider: CouponProvider;
  providerOrderNumber: string | null;
  maskedPin: string;
  expiresAt: Date;
  status: RewardCouponStatus;
  assignedUserId: number | null;
  userRewardId: number | null;
  assignedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnedCouponOutput {
  couponCode: string;
  couponImageUrl: string;
  expiresAt: Date;
}

function inventoryResponse(coupon: RewardCoupon): CouponInventoryOutput {
  return {
    id: Number(coupon.id),
    rewardId: Number(coupon.rewardId),
    provider: coupon.provider,
    providerOrderNumber: coupon.providerOrderNumber,
    maskedPin: `****-****-${coupon.pinLastFour}`,
    expiresAt: coupon.expiresAt,
    status:
      coupon.expiresAt <= new Date() &&
      coupon.status !== RewardCouponStatus.USED
        ? RewardCouponStatus.EXPIRED
        : coupon.status,
    assignedUserId:
      coupon.assignedUserId === null ? null : Number(coupon.assignedUserId),
    userRewardId:
      coupon.userRewardId === null ? null : Number(coupon.userRewardId),
    assignedAt: coupon.assignedAt,
    usedAt: coupon.usedAt,
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
}

@Injectable()
export class RewardCouponsService {
  private readonly logger = new Logger(RewardCouponsService.name);

  constructor(
    @InjectRepository(RewardCoupon)
    private readonly coupons: Repository<RewardCoupon>,
    @InjectRepository(Reward) private readonly rewards: Repository<Reward>,
    @InjectRepository(UserReward)
    private readonly owned: Repository<UserReward>,
    private readonly dataSource: DataSource,
    private readonly crypto: CouponCryptoService,
    private readonly storage: CouponStorageService,
  ) {}

  async list(rewardId: number): Promise<CouponInventoryOutput[]> {
    await this.requireCouponReward(rewardId);
    const result = await this.coupons.find({
      where: { rewardId },
      order: { createdAt: "DESC", id: "DESC" },
    });
    return result.map(inventoryResponse);
  }

  async create(
    rewardId: number,
    dto: CreateRewardCouponDto,
    image?: CouponImageUpload,
  ): Promise<CouponInventoryOutput> {
    await this.requireCouponReward(rewardId);
    this.validateImage(image);
    // Date-only gift coupon expiry is inclusive through the Korean calendar day.
    const expiresAt = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(dto.expiresAt)
        ? `${dto.expiresAt}T23:59:59.999+09:00`
        : dto.expiresAt,
    );
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException(
        "유효기간이 지난 쿠폰은 등록할 수 없습니다.",
      );
    }
    const sealed = this.crypto.seal(dto.pinCode);
    if (await this.coupons.exists({ where: { pinHash: sealed.pinHash } })) {
      throw new ConflictException("이미 등록된 쿠폰 번호입니다.");
    }
    const imageObjectKey = await this.storage.upload(
      image.buffer,
      image.mimetype,
    );
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const reward = await manager.getRepository(Reward).findOne({
          where: { id: rewardId, isActive: true },
          lock: { mode: "pessimistic_write" },
        });
        if (!reward || reward.type !== RewardType.COUPON) {
          throw new ConflictException(
            "보상이 변경되었습니다. 목록을 새로고침해 주세요.",
          );
        }
        const coupons = manager.getRepository(RewardCoupon);
        return coupons.save(
          coupons.create({
            rewardId,
            provider: CouponProvider.GIFTISHOW,
            providerOrderNumber: dto.providerOrderNumber?.trim() || null,
            ...sealed,
            imageObjectKey,
            imageContentType: image.mimetype,
            expiresAt,
            status: RewardCouponStatus.AVAILABLE,
            assignedUserId: null,
            userRewardId: null,
            assignedAt: null,
            usedAt: null,
          }),
        );
      });
      return inventoryResponse(result);
    } catch (error: unknown) {
      try {
        await this.storage.remove(imageObjectKey);
      } catch {
        // Do not log the PIN, object key, or original database parameters.
        this.logger.error(
          "쿠폰 등록 실패 후 비공개 이미지 정리에 실패했습니다.",
        );
      }
      if (error instanceof ConflictException) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ConflictException("이미 등록된 쿠폰 번호입니다.");
      }
      throw new InternalServerErrorException("쿠폰 등록에 실패했습니다.");
    }
  }

  async updateStatus(
    rewardId: number,
    id: number,
    dto: UpdateRewardCouponStatusDto,
  ): Promise<CouponInventoryOutput> {
    return this.dataSource.transaction(async (manager) => {
      const coupons = manager.getRepository(RewardCoupon);
      const coupon = await coupons.findOne({
        where: { id, rewardId },
        lock: { mode: "pessimistic_write" },
      });
      if (!coupon) throw new NotFoundException("쿠폰을 찾을 수 없습니다.");
      if (
        coupon.assignedUserId !== null ||
        coupon.userRewardId !== null ||
        ![RewardCouponStatus.AVAILABLE, RewardCouponStatus.DISABLED].includes(
          coupon.status,
        )
      ) {
        throw new BadRequestException(
          "이미 지급되거나 사용된 쿠폰의 상태는 변경할 수 없습니다.",
        );
      }
      if (coupon.expiresAt <= new Date())
        throw new BadRequestException(
          "만료된 쿠폰의 상태는 변경할 수 없습니다.",
        );
      await coupons.update({ id }, { status: dto.status });
      return inventoryResponse(await coupons.findOneByOrFail({ id }));
    });
  }

  async availableCounts(
    rewardIds: number[],
    manager?: EntityManager,
  ): Promise<Map<number, number>> {
    if (!rewardIds.length) return new Map();
    const coupons = manager?.getRepository(RewardCoupon) ?? this.coupons;
    const rows = await coupons
      .createQueryBuilder("coupon")
      .select("coupon.rewardId", "rewardId")
      .addSelect("COUNT(*)", "count")
      .where("coupon.rewardId IN (:...rewardIds)", { rewardIds })
      .andWhere("coupon.status = :status", {
        status: RewardCouponStatus.AVAILABLE,
      })
      .andWhere("coupon.expiresAt > CURRENT_TIMESTAMP")
      .andWhere("coupon.assignedUserId IS NULL AND coupon.userRewardId IS NULL")
      .groupBy("coupon.rewardId")
      .getRawMany<{ rewardId: string; count: string }>();
    return new Map(
      rows.map((row) => [Number(row.rewardId), Number(row.count)]),
    );
  }

  async reserve(
    manager: EntityManager,
    rewardId: number,
  ): Promise<RewardCoupon> {
    const coupon = await manager
      .getRepository(RewardCoupon)
      .createQueryBuilder("coupon")
      .addSelect("coupon.encryptedPin")
      .where("coupon.rewardId = :rewardId", { rewardId })
      .andWhere("coupon.status = :status", {
        status: RewardCouponStatus.AVAILABLE,
      })
      .andWhere("coupon.expiresAt > CURRENT_TIMESTAMP")
      .andWhere("coupon.assignedUserId IS NULL AND coupon.userRewardId IS NULL")
      .orderBy("coupon.expiresAt", "ASC")
      .addOrderBy("RANDOM()")
      .setLock("pessimistic_write")
      .setOnLocked("skip_locked")
      .take(1)
      .getOne();
    if (!coupon)
      throw new BadRequestException("준비된 쿠폰이 모두 소진되었습니다.");
    return coupon;
  }

  async assign(
    manager: EntityManager,
    coupon: RewardCoupon,
    userId: number,
    userRewardId: number,
  ): Promise<OwnedCouponOutput> {
    const result = await manager.getRepository(RewardCoupon).update(
      {
        id: coupon.id,
        status: RewardCouponStatus.AVAILABLE,
        userRewardId: IsNull(),
        assignedUserId: IsNull(),
      },
      {
        status: RewardCouponStatus.ASSIGNED,
        assignedUserId: userId,
        userRewardId,
        assignedAt: new Date(),
      },
    );
    if (result.affected !== 1)
      throw new ConflictException(
        "쿠폰 지급 상태가 변경되었습니다. 다시 시도해 주세요.",
      );
    return this.ownerResponse(coupon, userRewardId);
  }

  async ownerDetails(
    userId: number,
    userRewardIds: number[],
    manager?: EntityManager,
  ): Promise<Map<number, OwnedCouponOutput>> {
    if (!userRewardIds.length) return new Map();
    const coupons = manager?.getRepository(RewardCoupon) ?? this.coupons;
    const rows = await coupons.find({
      where: {
        assignedUserId: userId,
        userRewardId: In(userRewardIds),
        status: In([RewardCouponStatus.ASSIGNED, RewardCouponStatus.USED]),
      },
      select: {
        id: true,
        userRewardId: true,
        encryptedPin: true,
        expiresAt: true,
      },
    });
    return new Map(
      rows.map((coupon) => [
        Number(coupon.userRewardId),
        this.ownerResponse(coupon, Number(coupon.userRewardId)),
      ]),
    );
  }

  async ownerImage(
    userId: number,
    userRewardId: number,
  ): Promise<{ body: Buffer; contentType: string }> {
    const owned = await this.owned.findOneBy({ id: userRewardId, userId });
    if (!owned) throw new NotFoundException("쿠폰을 찾을 수 없습니다.");
    const coupon = await this.coupons.findOne({
      where: {
        userRewardId,
        assignedUserId: userId,
        status: In([RewardCouponStatus.ASSIGNED, RewardCouponStatus.USED]),
      },
      select: { id: true, imageObjectKey: true, imageContentType: true },
    });
    if (!coupon) throw new NotFoundException("쿠폰 이미지를 찾을 수 없습니다.");
    const isValidImageType = ["image/png", "image/jpeg", "image/webp"].includes(
      coupon.imageContentType,
    );
    if (!isValidImageType) {
      throw new BadRequestException("지원하지 않는 쿠폰 이미지 형식입니다.");
    }
    const body = await this.storage.read(coupon.imageObjectKey);
    return { body, contentType: coupon.imageContentType };
  }

  async markUsed(
    manager: EntityManager,
    userId: number,
    userRewardId: number,
  ): Promise<void> {
    const coupons = manager.getRepository(RewardCoupon);
    const coupon = await coupons.findOne({
      where: { userRewardId, assignedUserId: userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!coupon) return; // Historical rewards may predate real coupon inventory.
    if (coupon.status !== RewardCouponStatus.ASSIGNED)
      throw new BadRequestException("사용할 수 없는 쿠폰입니다.");
    if (coupon.expiresAt <= new Date())
      throw new BadRequestException("유효기간이 지난 쿠폰입니다.");
    await coupons.update(
      { id: coupon.id },
      { status: RewardCouponStatus.USED, usedAt: new Date() },
    );
  }

  private ownerResponse(
    coupon: RewardCoupon,
    userRewardId: number,
  ): OwnedCouponOutput {
    return {
      couponCode: this.crypto.open(coupon.encryptedPin),
      couponImageUrl: `/api/user/rewards/${userRewardId}/coupon-image`,
      expiresAt: coupon.expiresAt,
    };
  }

  private async requireCouponReward(rewardId: number): Promise<void> {
    const reward = await this.rewards.findOneBy({
      id: rewardId,
      isActive: true,
    });
    if (!reward) throw new NotFoundException("보상을 찾을 수 없습니다.");
    if (reward.type !== RewardType.COUPON)
      throw new BadRequestException("쿠폰 보상에만 쿠폰을 등록할 수 있습니다.");
  }

  private validateImage(
    image?: CouponImageUpload,
  ): asserts image is CouponImageUpload {
    if (!image || !image.buffer?.length)
      throw new BadRequestException("쿠폰 이미지를 첨부해 주세요.");
    if (
      image.size > COUPON_IMAGE_MAX_BYTES ||
      image.buffer.length > COUPON_IMAGE_MAX_BYTES
    ) {
      throw new BadRequestException("쿠폰 이미지는 10MB 이하여야 합니다.");
    }
    const data = image.buffer;
    const valid =
      (image.mimetype === "image/png" &&
        data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (image.mimetype === "image/jpeg" &&
        data[0] === 255 &&
        data[1] === 216 &&
        data[2] === 255) ||
      (image.mimetype === "image/webp" &&
        data.subarray(0, 4).toString() === "RIFF" &&
        data.subarray(8, 12).toString() === "WEBP");
    if (!valid)
      throw new BadRequestException(
        "PNG, JPEG, WEBP 형식의 쿠폰 이미지만 등록할 수 있습니다.",
      );
  }
}

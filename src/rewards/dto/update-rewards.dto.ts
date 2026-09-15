import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  MaxLength,
  Max,
  Min,
  IsOptional,
  IsString,
} from "class-validator";
import { RewardType } from "../../entities/reward.entity";

export class UpdateRewardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RewardType)
  type?: RewardType;

  @IsOptional()
  @IsInt()
  point?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  discount?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @IsISO8601()
  availableFrom?: string | null;

  @IsOptional()
  @IsBoolean()
  exchangeEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;
}

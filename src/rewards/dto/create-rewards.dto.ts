import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsISO8601,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { RewardType } from "../../entities/reward.entity";

export class CreateRewardDto {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsEnum(RewardType)
  type?: RewardType;

  @IsInt()
  point: number;

  @IsString()
  description: string;

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

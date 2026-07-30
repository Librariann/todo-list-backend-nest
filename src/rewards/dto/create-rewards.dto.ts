import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
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

  @IsEnum(RewardType)
  type: RewardType;

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
}

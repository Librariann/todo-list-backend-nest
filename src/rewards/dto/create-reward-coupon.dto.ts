import { Transform } from "class-transformer";
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateRewardCouponDto {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  pinCode: string;

  @IsISO8601({ strict: true })
  expiresAt: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  providerOrderNumber?: string;
}

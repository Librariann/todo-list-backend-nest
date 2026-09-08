import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import {
  MobilePlatform,
  PushProvider,
} from "../../entities/push-device.entity";

export class RegisterPushDeviceDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{16,128}$/)
  installationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsEnum(PushProvider)
  provider: PushProvider;

  @IsEnum(MobilePlatform)
  platform: MobilePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceModel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string | null;
}

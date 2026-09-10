import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "알림 시간은 HH:mm 형식이어야 합니다.",
  })
  dailyReminderTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

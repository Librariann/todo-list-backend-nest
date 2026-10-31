import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from "class-validator";

export class HabitReminderDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "알림 시간은 HH:mm 형식으로 입력해주세요.",
  })
  reminderTime?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  reminderDays?: number[];
}

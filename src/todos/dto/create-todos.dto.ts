import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateTodoDto {
  @IsString()
  @MinLength(1, { message: "할 일 이름은 최소 1자 이상이어야 합니다." })
  @MaxLength(50, { message: "할 일 이름은 최대 50자 이하이어야 합니다." })
  name: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "할 일 날짜는 YYYY-MM-DD 형식이어야 합니다.",
  })
  targetDate: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: "알림 시간을 확인해주세요." })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, {
    message: "알림 시간에 시간대가 필요합니다.",
  })
  reminderAt?: string | null;
}

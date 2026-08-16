import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { NicknameMaxLength } from "./nickname-length.validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "닉네임은 최소 2자 이상이어야 합니다." })
  @NicknameMaxLength()
  @Matches(/^[가-힣a-zA-Z0-9_]+$/, {
    message: "닉네임은 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.",
  })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: "이름은 최대 50자 이하이어야 합니다." })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: "연락처는 최대 20자 이하이어야 합니다." })
  @Matches(/^[0-9+\-\s]*$/, {
    message: "연락처는 숫자, 공백, +, -만 사용할 수 있습니다.",
  })
  phoneNumber?: string;
}

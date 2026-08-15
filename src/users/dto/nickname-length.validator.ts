import {
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

export const NICKNAME_MAX_WEIGHT = 12;

function getNicknameWeight(value: string): number {
  return Array.from(value).reduce(
    (weight, character) => weight + (/[가-힣]/.test(character) ? 2 : 1),
    0,
  );
}

@ValidatorConstraint({ name: "nicknameWeightedLength", async: false })
export class NicknameWeightedLengthConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return (
      typeof value === "string" &&
      getNicknameWeight(value) <= NICKNAME_MAX_WEIGHT
    );
  }

  defaultMessage(): string {
    return "닉네임은 한글 6자 또는 영문·숫자·밑줄 12자 이내로 입력해주세요.";
  }
}

export const NicknameMaxLength = () =>
  Validate(NicknameWeightedLengthConstraint);

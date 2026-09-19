import { describe, expect, it } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { SaveNoticeDto } from "./save-notice.dto";

const valid = { title: "공지 제목", content: "공지 내용", isPublished: false };
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate(input: unknown): Promise<SaveNoticeDto> {
  return pipe.transform(input, {
    type: "body",
    metatype: SaveNoticeDto,
  }) as Promise<SaveNoticeDto>;
}

describe("SaveNoticeDto", () => {
  it("trims strings and removes unknown fields using production pipe options", async () => {
    await expect(
      validate({
        title: "  공지 제목  ",
        content: "\n공지 내용\n",
        isPublished: false,
        id: 999,
      }),
    ).resolves.toEqual(valid);
  });

  it("accepts exact length limits and boolean publication", async () => {
    await expect(
      validate({
        title: "가".repeat(100),
        content: "가".repeat(10000),
        isPublished: true,
      }),
    ).resolves.toBeInstanceOf(SaveNoticeDto);
  });

  it.each([
    { title: "  " },
    { title: null },
    { title: 123 },
    { title: "가".repeat(101) },
    { content: "\n\t " },
    { content: null },
    { content: 123 },
    { content: "가".repeat(10001) },
    { isPublished: "false" },
    { isPublished: 0 },
    { isPublished: null },
    { title: undefined },
    { content: undefined },
    { isPublished: undefined },
  ])("rejects invalid or missing replacement fields: %p", async (invalid) => {
    await expect(validate({ ...valid, ...invalid })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

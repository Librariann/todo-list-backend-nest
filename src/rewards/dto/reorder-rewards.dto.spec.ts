import { describe, expect, it } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ReorderRewardsDto } from "./reorder-rewards.dto";

const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validate(rewardIds: unknown): Promise<ReorderRewardsDto> {
  return pipe.transform(
    { rewardIds },
    {
      type: "body",
      metatype: ReorderRewardsDto,
    },
  ) as Promise<ReorderRewardsDto>;
}

describe("ReorderRewardsDto", () => {
  it("accepts unique positive integer ids in requested order", async () => {
    await expect(validate([3, 1, 2])).resolves.toEqual({
      rewardIds: [3, 1, 2],
    });
  });

  it("accepts the maximum list size", async () => {
    await expect(
      validate(Array.from({ length: 1000 }, (_, index) => index + 1)),
    ).resolves.toBeInstanceOf(ReorderRewardsDto);
  });

  it.each([
    { ids: undefined },
    { ids: null },
    { ids: 1 },
    { ids: [] },
    { ids: [1, 1] },
    { ids: [0] },
    { ids: [-1] },
    { ids: [1.5] },
    { ids: ["1"] },
    { ids: [null] },
    { ids: [Number.MAX_SAFE_INTEGER + 1] },
    { ids: Array.from({ length: 1001 }, (_, index) => index + 1) },
  ])(
    "rejects malformed, duplicate, or unbounded ids (case %#)",
    async ({ ids }) => {
      await expect(validate(ids)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

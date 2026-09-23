import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { PointInputDto } from "./point-input.dto";

const pipe = new ValidationPipe({ whitelist: true, transform: true });

describe("PointInputDto", () => {
  it("normalizes integer-like input values", async () => {
    await expect(
      pipe.transform(
        { id: "7", point: "2000" },
        { type: "body", metatype: PointInputDto },
      ),
    ).resolves.toMatchObject({ id: 7, point: 2000 });
  });

  it.each([
    { id: 0, point: 100 },
    { id: 1, point: 0 },
    { id: 1, point: 1.5 },
  ])("rejects invalid point input %#", async (input) => {
    await expect(
      pipe.transform(input, { type: "body", metatype: PointInputDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

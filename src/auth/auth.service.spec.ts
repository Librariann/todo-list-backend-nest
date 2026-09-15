import { describe, expect, it, jest } from "@jest/globals";
import { User } from "../entities/user.entity";
import { AuthService } from "./auth.service";

function setupOAuthUser(
  existing: User | null = null,
  takenNicknames: string[] = [],
) {
  const taken = new Set(takenNicknames);
  const users = {
    findOne: jest.fn(() => Promise.resolve(existing)),
    exists: jest.fn(({ where }: { where: { nickname: string } }) =>
      Promise.resolve(taken.has(where.nickname)),
    ),
    create: jest.fn((values: Partial<User>) => values as User),
    save: jest.fn((user: User) => Promise.resolve(user)),
  };
  const config = { get: jest.fn(() => undefined) };
  const service = new AuthService(
    users as never,
    {} as never,
    {} as never,
    config as never,
  );
  return { service, users };
}

describe("AuthService OAuth nicknames", () => {
  it("stores the provider nickname on first signup instead of the email prefix", async () => {
    const { service, users } = setupOAuthUser();

    const user = await service.upsertOAuth(
      "kakao",
      "kakao-id",
      "different@example.com",
      "실명",
      "카카오별명",
    );

    expect(user.nickname).toBe("카카오별명");
    expect(user.name).toBe("실명");
    expect(users.save).toHaveBeenCalledTimes(1);
  });

  it("keeps the nickname already changed in GrowDo on subsequent logins", async () => {
    const existing = {
      id: 7,
      nickname: "직접설정",
      name: "",
      email: "user@example.com",
    } as User;
    const { service } = setupOAuthUser(existing);

    const user = await service.upsertOAuth(
      "naver",
      "naver-id",
      "user@example.com",
      "네이버이름",
      "네이버별명",
    );

    expect(user.nickname).toBe("직접설정");
    expect(user.name).toBe("네이버이름");
  });

  it("fits provider names to the GrowDo limit and resolves a duplicate", async () => {
    const { service } = setupOAuthUser(null, ["가나다라마바"]);

    const user = await service.upsertOAuth(
      "apple",
      "apple-id",
      "relay@example.com",
      "가나다라마바사",
      "가나다라마바사",
    );

    expect(user.nickname).toBe("가나다라마2");
  });
});

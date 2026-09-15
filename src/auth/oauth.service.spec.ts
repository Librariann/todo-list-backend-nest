import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { OAuthService } from "./oauth.service";

function setupOAuthProfile(profile: Record<string, unknown>) {
  const config = {
    get: jest.fn((key: string) =>
      key === "BACKEND_URL" ? "http://localhost:8080" : "oauth-client",
    ),
  };
  const auth = {
    upsertOAuth: jest.fn(() => Promise.resolve({ id: 1 })),
  };
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token" }),
    } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => profile } as Response);
  return { service: new OAuthService(config as never, auth as never), auth };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("OAuthService profile nicknames", () => {
  it("passes the Google profile name as the initial nickname", async () => {
    const { service, auth } = setupOAuthProfile({
      sub: "google-id",
      email: "google@example.com",
      name: "Google Name",
    });

    await service.callback("google", "authorization-code");

    expect(auth.upsertOAuth).toHaveBeenCalledWith(
      "google",
      "google-id",
      "google@example.com",
      "Google Name",
      "Google Name",
    );
  });

  it("prefers the Kakao profile nickname", async () => {
    const { service, auth } = setupOAuthProfile({
      id: 42,
      kakao_account: {
        email: "kakao@example.com",
        profile: { nickname: "카카오별명" },
      },
    });

    await service.callback("kakao", "authorization-code");

    expect(auth.upsertOAuth).toHaveBeenCalledWith(
      "kakao",
      "42",
      "kakao@example.com",
      "카카오별명",
      "카카오별명",
    );
  });

  it("uses the Naver nickname instead of the real name", async () => {
    const { service, auth } = setupOAuthProfile({
      response: {
        id: "naver-id",
        email: "naver@example.com",
        name: "네이버실명",
        nickname: "네이버별명",
      },
    });

    await service.callback("naver", "authorization-code");

    expect(auth.upsertOAuth).toHaveBeenCalledWith(
      "naver",
      "naver-id",
      "naver@example.com",
      "네이버실명",
      "네이버별명",
    );
  });
});

import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AppleAuthService } from "./apple-auth.service";

jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => jest.fn()),
  importPKCS8: jest.fn(() => Promise.resolve({})),
  jwtVerify: jest.fn(),
  SignJWT: jest.fn().mockImplementation(() => {
    const chain = {
      setProtectedHeader: jest.fn(),
      setIssuer: jest.fn(),
      setSubject: jest.fn(),
      setAudience: jest.fn(),
      setIssuedAt: jest.fn(),
      setExpirationTime: jest.fn(),
      sign: jest.fn(() => Promise.resolve("apple-client-secret")),
    };
    chain.setProtectedHeader.mockReturnValue(chain);
    chain.setIssuer.mockReturnValue(chain);
    chain.setSubject.mockReturnValue(chain);
    chain.setAudience.mockReturnValue(chain);
    chain.setIssuedAt.mockReturnValue(chain);
    chain.setExpirationTime.mockReturnValue(chain);
    return chain;
  }),
}));

describe("AppleAuthService", () => {
  const mockJwtVerify = jest.requireMock<{ jwtVerify: jest.Mock }>(
    "jose",
  ).jwtVerify;
  const upsertOAuth = jest.fn();
  const configValues: Record<string, string> = {
    APPLE_CLIENT_ID: "com.growdo.app",
    APPLE_TEAM_ID: "TEAM123",
    APPLE_KEY_ID: "KEY123",
    APPLE_PRIVATE_KEY: "private-key",
  };
  const config = {
    get: jest.fn((name: string) => configValues[name]),
  } as unknown as ConfigService;
  const auth = {
    upsertOAuth,
  } as unknown as AuthService;
  const service = new AppleAuthService(config, auth);

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ refresh_token: "apple-refresh-token" }),
      } as Response),
    );
  });

  it("verifies Apple credentials and upserts the GrowDo user", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: "apple-user-id",
        email: "user@privaterelay.appleid.com",
        email_verified: "true",
        nonce: "login-nonce",
      },
    });
    upsertOAuth.mockResolvedValue({ id: 7 });

    await expect(
      service.authenticate({
        identityToken: "identity-token",
        authorizationCode: "authorization-code",
        nonce: "login-nonce",
        fullName: "홍길동",
      }),
    ).resolves.toEqual({ id: 7 });
    expect(upsertOAuth).toHaveBeenCalledWith(
      "apple",
      "apple-user-id",
      "user@privaterelay.appleid.com",
      "홍길동",
      "apple-refresh-token",
    );
  });

  it("rejects a credential whose nonce does not match", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: "apple-user-id",
        email: "user@example.com",
        email_verified: true,
        nonce: "different-nonce",
      },
    });

    await expect(
      service.authenticate({
        identityToken: "identity-token",
        authorizationCode: "authorization-code",
        nonce: "login-nonce",
      }),
    ).rejects.toThrow("Apple 로그인 정보가 올바르지 않습니다.");
    expect(upsertOAuth).not.toHaveBeenCalled();
  });
});

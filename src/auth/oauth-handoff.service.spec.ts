import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import { OAuthHandoffService } from "./oauth-handoff.service";

describe("OAuthHandoffService", () => {
  let service: OAuthHandoffService;

  beforeEach(() => {
    service = new OAuthHandoffService({
      get: () => undefined,
    } as unknown as ConfigService);
  });

  it("exchanges a code once when the PKCE verifier matches", async () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256")
      .update(verifier, "ascii")
      .digest("base64url");
    const code = await service.issue(7, challenge);

    await expect(service.consume(code, verifier)).resolves.toBe(7);
    await expect(service.consume(code, verifier)).rejects.toThrow("만료");
  });

  it("rejects a mismatched PKCE verifier", async () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256")
      .update(verifier, "ascii")
      .digest("base64url");
    const code = await service.issue(7, challenge);

    await expect(
      service.consume(code, randomBytes(32).toString("base64url")),
    ).rejects.toThrow("PKCE");
  });
});

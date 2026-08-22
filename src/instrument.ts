import { config as loadEnv } from "dotenv";
import * as Sentry from "@sentry/nestjs";

// Railway 같은 플랫폼은 실제 환경변수를 주입하지만, 로컬에서는 .env 파일을 읽어야
// Sentry / Slack 설정이 적용된다. ConfigModule 은 Nest 부트스트랩 이후에 로드되므로
// 여기서 한 번 더 직접 읽는다.
for (const path of process.env.NODE_ENV
  ? [`.env.${process.env.NODE_ENV}`, ".env"]
  : [".env"]) {
  loadEnv({ path, override: false, quiet: true });
}

const dsn = process.env.SENTRY_DSN?.trim();

Sentry.init({
  enabled: Boolean(dsn),
  dsn,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  // 기본은 0(성능 추적 끔). 필요할 때 환경변수로 0.1 정도부터 올린다.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  // 헬스체크 요청은 노이즈라 트랜잭션에서 제외한다.
  ignoreTransactions: ["GET /health", "GET /health/detail"],
});

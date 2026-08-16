import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { RedisHealthIndicator } from "./redis.health";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Railway 헬스체크가 바라보는 엔드포인트.
   * DB 만 확인한다 — 여기서 503 이 나오면 컨테이너가 재시작되므로
   * 앱이 계속 서빙 가능한 상태에서 실패해서는 안 된다.
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: "liveness/readiness 체크 (DB)" })
  check() {
    return this.health.check([
      () => this.db.pingCheck("database").withTimeout(3000),
    ]);
  }

  /** 사람이 보는 상세 상태. Redis 가 죽어도 degraded 로 200 을 유지한다. */
  @Public()
  @Get("detail")
  @HealthCheck()
  @ApiOperation({ summary: "의존성 상세 상태 (DB + Redis)" })
  detail() {
    return this.health.check([
      () => this.db.pingCheck("database").withTimeout(3000),
      () => this.redis.isHealthy(),
    ]);
  }
}

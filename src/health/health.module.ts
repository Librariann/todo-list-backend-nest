import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthMonitorService } from "./health-monitor.service";
import { HealthController } from "./health.controller";
import { RedisHealthIndicator } from "./redis.health";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, HealthMonitorService],
})
export class HealthModule {}

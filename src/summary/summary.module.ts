import { Module } from "@nestjs/common";
import { ChallengesModule } from "../challenges/challenges.module";
import { PointsModule } from "../points/points.module";
import { RewardsModule } from "../rewards/rewards.module";
import { SummaryController } from "./summary.controller";
@Module({
  imports: [PointsModule, RewardsModule, ChallengesModule],
  controllers: [SummaryController],
})
export class SummaryModule {}

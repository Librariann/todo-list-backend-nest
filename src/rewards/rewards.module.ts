import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Reward, UserReward } from "../entities/reward.entity";
import { PointsModule } from "../points/points.module";
import { RewardsController, UserRewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
@Module({
  imports: [TypeOrmModule.forFeature([Reward, UserReward]), PointsModule],
  controllers: [RewardsController, UserRewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

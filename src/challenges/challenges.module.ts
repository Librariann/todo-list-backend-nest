import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Challenge, UserProgressChallenge } from "../entities/challenge.entity";
import { PointsModule } from "../points/points.module";
import {
  ChallengesController,
  UserChallengesController,
} from "./challenges.controller";
import { ChallengesService } from "./challenges.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([Challenge, UserProgressChallenge]),
    PointsModule,
  ],
  controllers: [ChallengesController, UserChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}

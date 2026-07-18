import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Challenge,
  ChallengeAssignment,
  ChallengeRotationRun,
  ChallengeRotationSetting,
  UserProgressChallenge,
} from "../entities/challenge.entity";
import { PointsModule } from "../points/points.module";
import { Todo } from "../entities/todo.entity";
import {
  ChallengesController,
  UserChallengesController,
} from "./challenges.controller";
import { ChallengesService } from "./challenges.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Challenge,
      ChallengeAssignment,
      ChallengeRotationRun,
      ChallengeRotationSetting,
      UserProgressChallenge,
      Todo,
    ]),
    PointsModule,
  ],
  controllers: [ChallengesController, UserChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}

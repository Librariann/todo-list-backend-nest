import { Controller, Get, Header } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { ChallengesService } from "../challenges/challenges.service";
import { success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { PointsService } from "../points/points.service";
import { RewardsService } from "../rewards/rewards.service";

@Controller("api/user/summary")
export class SummaryController {
  constructor(
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
    private readonly challenges: ChallengesService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async get(@CurrentUser() user: User) {
    const [points, rewards, achievedChallenges] = await Promise.all([
      this.points.total(user.id),
      this.rewards.userSummaryList(user.id),
      this.challenges.achieved(user.id),
    ]);
    return success(
      { points, rewards, achievedChallenges },
      "사용자 요약 정보를 성공적으로 불러왔습니다.",
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiResponse, success } from "../common/api-response";
import { WorkType } from "../entities/challenge.entity";
import { User } from "../entities/user.entity";
import {
  ChallengeOutput,
  ChallengeProgressOutput,
  ChallengesService,
} from "./challenges.service";
import { CreateChallengeDto } from "./dto/create-challenges.dto";
import { UpdateChallengeDto } from "./dto/update-challenges.dto";

@Controller("api/challenges")
export class ChallengesController {
  constructor(private readonly service: ChallengesService) {}

  @Get()
  async list(): Promise<ApiResponse<ChallengeOutput[]>> {
    const result = await this.service.list();
    return success(result, "도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Post("register")
  async create(
    @Body() dto: CreateChallengeDto,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.create(dto);
    return success(result, "도전과제가 성공적으로 등록 완료되었습니다.");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateChallengeDto,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.update(id, dto);
    return success(result, "도전과제를 성공적으로 수정 했습니다.");
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<ChallengeOutput>> {
    const result = await this.service.remove(id);
    return success(result, "도전과제를 성공적으로 삭제 완료되었습니다.");
  }
}

@Controller("api/user/challenges")
export class UserChallengesController {
  constructor(private readonly service: ChallengesService) {}

  @Get()
  async list(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<ChallengeProgressOutput[]>> {
    const result = await this.service.withProgress(user.id);
    return success(result, "도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Get("achieved")
  async achieved(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<ChallengeProgressOutput[]>> {
    const result = await this.service.achieved(user.id);
    return success(result, "달성한 도전과제 목록을 성공적으로 불러왔습니다.");
  }

  @Post("progress")
  async progress(
    @CurrentUser() user: User,
    @Body("workType") workType: WorkType,
  ): Promise<ApiResponse<null>> {
    await this.service.record(user.id, workType);
    return success(null, "도전과제 진행상황이 업데이트되었습니다.");
  }
}

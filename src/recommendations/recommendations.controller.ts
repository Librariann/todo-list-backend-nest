import {
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { RecommendationsService } from "./recommendations.service";

@Controller("api/recommendations")
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@CurrentUser() user: User) {
    return success(await this.service.list(user.id), "추천 조회 성공");
  }

  @Post("generate")
  @Header("Cache-Control", "private, no-store")
  async generate(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return success(await this.service.generate(user.id), "추천 생성 성공");
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const current = await this.service.list(user.id);
        response.setHeader("Retry-After", String(current.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Post(":id/accept")
  @Header("Cache-Control", "private, no-store")
  async accept(
    @CurrentUser() user: User,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return success(
      await this.service.accept(user.id, id),
      "추천한 항목을 등록했어요.",
    );
  }

  @Post(":id/dismiss")
  @Header("Cache-Control", "private, no-store")
  async dismiss(
    @CurrentUser() user: User,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return success(await this.service.dismiss(user.id, id), "추천을 닫았어요.");
  }
}

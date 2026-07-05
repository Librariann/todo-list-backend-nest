import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsInt } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { success } from "../common/api-response";
import { User, UserRole } from "../entities/user.entity";
import { PointsService } from "./points.service";
class PointInputDto {
  @IsInt() id: number;
  @IsInt() point: number;
}
@Controller("api/user/points")
export class PointsController {
  constructor(private readonly service: PointsService) {}
  @Get()
  async get(@CurrentUser() user: User) {
    return success(await this.service.total(user.id), "포인트 조회 성공");
  }

  @Roles(UserRole.ADMIN) @Post() async input(@Body() dto: PointInputDto) {
    return success(
      await this.service.adjust(dto.id, dto.point),
      "포인트 입력 성공",
    );
  }
}

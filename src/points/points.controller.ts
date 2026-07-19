import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User, UserRole } from "../entities/user.entity";
import { PointInputDto } from "./dto/point-input.dto";
import { PointsService } from "./points.service";
@Controller("api/user/points")
export class PointsController {
  constructor(private readonly service: PointsService) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<ApiResponse<number>> {
    const result = await this.service.total(user.id);
    return success(result, "포인트 조회 성공");
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async input(@Body() dto: PointInputDto): Promise<ApiResponse<number>> {
    console.log(dto);
    const result = await this.service.adjust(+dto.id, dto.point);
    return success(result, "포인트 입력 성공");
  }
}

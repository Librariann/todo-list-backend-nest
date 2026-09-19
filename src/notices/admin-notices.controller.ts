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
import { Roles } from "../auth/roles.decorator";
import { ApiResponse, success } from "../common/api-response";
import { UserRole } from "../entities/user.entity";
import { SaveNoticeDto } from "./dto/save-notice.dto";
import { NoticeOutput, NoticesService } from "./notices.service";

@Roles(UserRole.ADMIN)
@Controller("api/admin/notices")
export class AdminNoticesController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  async list(): Promise<ApiResponse<NoticeOutput[]>> {
    const result = await this.service.listAll();
    return success(result, "관리자 공지사항 목록 조회 성공");
  }

  @Post()
  async create(@Body() dto: SaveNoticeDto): Promise<ApiResponse<NoticeOutput>> {
    const result = await this.service.create(dto);
    return success(result, "공지사항 등록 성공");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SaveNoticeDto,
  ): Promise<ApiResponse<NoticeOutput>> {
    const result = await this.service.update(id, dto);
    return success(result, "공지사항 수정 성공");
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    const result = await this.service.remove(id);
    return success(result, "공지사항 삭제 성공");
  }
}

import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { ApiResponse, success } from "../common/api-response";
import { NoticeOutput, NoticeSummary, NoticesService } from "./notices.service";

@Public()
@Controller("api/notices")
export class NoticesController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  async list(): Promise<ApiResponse<NoticeSummary[]>> {
    const result = await this.service.listPublished();
    return success(result, "공지사항 목록 조회 성공");
  }

  @Get(":id")
  async get(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApiResponse<NoticeOutput>> {
    const result = await this.service.getPublished(id);
    return success(result, "공지사항 조회 성공");
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notice } from "../entities/notice.entity";
import { SaveNoticeDto } from "./dto/save-notice.dto";

export interface NoticeSummary {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoticeOutput extends NoticeSummary {
  content: string;
  isPublished: boolean;
}

function noticeSummary(notice: Notice): NoticeSummary {
  return {
    id: Number(notice.id),
    title: notice.title,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
  };
}

function noticeOutput(notice: Notice): NoticeOutput {
  return {
    ...noticeSummary(notice),
    content: notice.content,
    isPublished: notice.isPublished,
  };
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(Notice) private readonly notices: Repository<Notice>,
  ) {}

  async listPublished(): Promise<NoticeSummary[]> {
    const result = await this.notices.find({
      where: { isPublished: true },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    return result.map(noticeSummary);
  }

  async getPublished(id: number): Promise<NoticeOutput> {
    const result = await this.notices.findOneBy({ id, isPublished: true });
    if (!result) throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    return noticeOutput(result);
  }

  async listAll(): Promise<NoticeOutput[]> {
    const result = await this.notices.find({
      order: { createdAt: "DESC", id: "DESC" },
    });
    return result.map(noticeOutput);
  }

  async create(dto: SaveNoticeDto): Promise<NoticeOutput> {
    const result = await this.notices.save(this.notices.create(dto));
    return noticeOutput(result);
  }

  async update(id: number, dto: SaveNoticeDto): Promise<NoticeOutput> {
    const notice = await this.notices.findOneBy({ id });
    if (!notice) throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    notice.title = dto.title;
    notice.content = dto.content;
    notice.isPublished = dto.isPublished;
    const result = await this.notices.save(notice);
    return noticeOutput(result);
  }

  async remove(id: number): Promise<null> {
    const result = await this.notices.delete({ id });
    if (!result.affected)
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    return null;
  }
}

import { describe, expect, it, jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { Notice } from "../entities/notice.entity";
import { NoticesService } from "./notices.service";

const published: Notice = {
  id: 1,
  title: "새로운 공지",
  content: "공지사항 내용",
  isPublished: true,
  createdAt: new Date("2026-09-20T00:00:00Z"),
  updatedAt: new Date("2026-09-20T00:00:00Z"),
};

function setup() {
  const repository = {
    find: jest.fn<Repository<Notice>["find"]>(),
    findOneBy: jest.fn<Repository<Notice>["findOneBy"]>(),
    create: jest.fn((dto: Partial<Notice>) => ({ ...published, ...dto })),
    save: jest.fn((notice: Notice) => Promise.resolve(notice)),
    delete: jest.fn<Repository<Notice>["delete"]>(),
  };
  const service = new NoticesService(
    repository as unknown as Repository<Notice>,
  );
  return { service, repository };
}

describe("NoticesService", () => {
  it("queries only published summaries in newest-first order", async () => {
    const { service, repository } = setup();
    repository.find.mockResolvedValue([published]);

    const result = await service.listPublished();

    expect(repository.find).toHaveBeenCalledWith({
      where: { isPublished: true },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    expect(result).toEqual([
      {
        id: 1,
        title: published.title,
        createdAt: published.createdAt,
        updatedAt: published.updatedAt,
      },
    ]);
  });

  it("returns an empty list when no notices are published", async () => {
    const { service, repository } = setup();
    repository.find.mockResolvedValue([]);
    await expect(service.listPublished()).resolves.toEqual([]);
  });

  it("returns published details", async () => {
    const { service, repository } = setup();
    repository.findOneBy.mockResolvedValue(published);
    await expect(service.getPublished(1)).resolves.toEqual(published);
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: 1,
      isPublished: true,
    });
  });

  it("treats a draft as missing on public detail requests", async () => {
    const { service, repository } = setup();
    const draft = { ...published, isPublished: false };
    repository.findOneBy.mockImplementation((where) =>
      Promise.resolve(
        "isPublished" in where && where.isPublished ? null : draft,
      ),
    );
    await expect(service.getPublished(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: 1,
      isPublished: true,
    });
  });

  it("includes drafts and full content in the administrator list", async () => {
    const { service, repository } = setup();
    const draft = { ...published, isPublished: false };
    repository.find.mockResolvedValue([draft]);
    await expect(service.listAll()).resolves.toEqual([draft]);
    expect(repository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC", id: "DESC" },
    });
  });

  it("creates and edits notices, including unpublishing", async () => {
    const { service, repository } = setup();
    const dto = {
      title: "수정 제목",
      content: "수정 내용",
      isPublished: false,
    };
    await expect(service.create(dto)).resolves.toMatchObject(dto);
    repository.findOneBy.mockResolvedValue({ ...published });
    await expect(service.update(1, dto)).resolves.toMatchObject(dto);
    expect(repository.save).toHaveBeenLastCalledWith({ ...published, ...dto });
  });

  it("returns 404 when an update targets a missing notice", async () => {
    const { service, repository } = setup();
    repository.findOneBy.mockResolvedValue(null);
    await expect(service.update(1, published)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("deletes existing notices and rejects missing notices", async () => {
    const { service, repository } = setup();
    repository.delete.mockResolvedValueOnce({ raw: [], affected: 1 });
    await expect(service.remove(1)).resolves.toBeNull();
    expect(repository.delete).toHaveBeenCalledWith({ id: 1 });
    repository.delete.mockResolvedValueOnce({ raw: [], affected: 0 });
    await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

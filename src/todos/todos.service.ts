import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChallengesService } from "../challenges/challenges.service";
import { WorkType } from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    private readonly challenges: ChallengesService,
  ) {}
  list(userId: number, targetDate: string) {
    return this.todos.find({
      where: { userId, targetDate },
      order: { orderIndex: "ASC" },
    });
  }
  async create(userId: number, name: string, targetDate: string) {
    if (await this.todos.exists({ where: { name } }))
      throw new ConflictException(`이미 사용중인 할 일 입니다: ${name}`);
    const latest = await this.todos.findOne({
      where: { userId, targetDate },
      order: { orderIndex: "DESC" },
    });
    return this.todos.save(
      this.todos.create({
        userId,
        name,
        targetDate,
        status: TodoStatus.READY,
        orderIndex: (latest?.orderIndex ?? 0) + 1,
      }),
    );
  }
  async update(
    userId: number,
    id: number,
    dto: { name?: string; targetDate?: string },
  ) {
    const todo = await this.owned(userId, id);
    if (
      dto.name &&
      (await this.todos
        .createQueryBuilder("t")
        .where("t.name = :name AND t.id != :id", { name: dto.name, id })
        .getExists())
    )
      throw new ConflictException(`이미 사용중인 할 일명 입니다: ${dto.name}`);
    Object.assign(todo, dto);
    return this.todos.save(todo);
  }
  async status(userId: number, id: number, status: TodoStatus) {
    const todo = await this.owned(userId, id);
    if (todo.status === TodoStatus.DONE && status !== TodoStatus.DONE)
      throw new BadRequestException(
        "이미 완료된 할 일은 상태를 변경할 수 없습니다.",
      );
    const newlyDone =
      todo.status !== TodoStatus.DONE && status === TodoStatus.DONE;
    todo.status = status;
    await this.todos.save(todo);
    if (newlyDone) await this.challenges.record(userId, WorkType.TODOS);
  }
  async reorder(
    userId: number,
    targetDate: string,
    indexIds: Array<{ id: number }>,
  ) {
    const owned = await this.list(userId, targetDate);
    const ids = new Set(owned.map((t) => Number(t.id)));
    await Promise.all(
      indexIds
        .filter((x) => ids.has(Number(x.id)))
        .map((x, index) => this.todos.update(x.id, { orderIndex: index + 1 })),
    );
  }
  async remove(userId: number, id: number) {
    await this.todos.remove(await this.owned(userId, id));
  }
  private async owned(userId: number, id: number) {
    const todo = await this.todos.findOneBy({ id, userId });
    if (!todo) throw new NotFoundException(`할 일을 찾을 수 없습니다: ${id}`);
    return todo;
  }
}

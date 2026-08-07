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
import { success } from "../common/api-response";
import { TodoStatus } from "../entities/todo.entity";
import { User } from "../entities/user.entity";
import { CreateTodoDto } from "./dto/create-todos.dto";
import { ReorderTodoDto } from "./dto/reorder-todos.dto";
import { UpdateTodoDto } from "./dto/update-todos.dto";
import { TodosService } from "./todos.service";

@Controller("api/todos")
export class TodosController {
  constructor(private readonly service: TodosService) {}

  @Get(":date")
  async list(@Param("date") date: string, @CurrentUser() user: User) {
    return success(
      await this.service.list(user.id, date),
      "할 일 목록을 성공적으로 불러왔습니다.",
    );
  }
  @Post("register")
  async create(@Body() dto: CreateTodoDto, @CurrentUser() user: User) {
    return success(
      await this.service.create(user.id, dto),
      "할 일이 성공적으로 등록 완료되었습니다.",
    );
  }

  @Patch("order")
  async reorder(@Body() dto: ReorderTodoDto, @CurrentUser() user: User) {
    await this.service.reorder(user.id, dto);
    return success(null, "할 일 순서가 성공적으로 수정 완료되었습니다.");
  }

  @Patch(":id/status/:status")
  async status(
    @Param("id", ParseIntPipe) id: number,
    @Param("status") status: TodoStatus,
    @CurrentUser() user: User,
  ) {
    await this.service.status(user.id, id, status);
    return success(null, "할 일 상태가 성공적으로 수정 완료되었습니다.");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTodoDto,
    @CurrentUser() user: User,
  ) {
    return success(
      await this.service.update(user.id, id, dto),
      "할 일이 성공적으로 수정 완료되었습니다.",
    );
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(user.id, id);
    return success(null, "할 일이 성공적으로 삭제 완료되었습니다.");
  }
}

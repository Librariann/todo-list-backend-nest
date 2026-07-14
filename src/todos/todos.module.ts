import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChallengesModule } from "../challenges/challenges.module";
import { Todo } from "../entities/todo.entity";
import { TodosController } from "./todos.controller";
import { TodosService } from "./todos.service";
@Module({
  imports: [TypeOrmModule.forFeature([Todo]), ChallengesModule],
  controllers: [TodosController],
  providers: [TodosService],
})
export class TodosModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserPoint } from "../entities/user-point.entity";
import { UserReward } from "../entities/reward.entity";
import { User } from "../entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
@Module({
  imports: [TypeOrmModule.forFeature([User, UserPoint, UserReward])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserPoint } from "../entities/user-point.entity";
import { User } from "../entities/user.entity";
import { PointsController } from "./points.controller";
import { PointsService } from "./points.service";
@Module({
  imports: [TypeOrmModule.forFeature([UserPoint, User])],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}

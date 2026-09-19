import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notice } from "../entities/notice.entity";
import { AdminNoticesController } from "./admin-notices.controller";
import { NoticesController } from "./notices.controller";
import { NoticesService } from "./notices.service";

@Module({
  imports: [TypeOrmModule.forFeature([Notice])],
  controllers: [NoticesController, AdminNoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}

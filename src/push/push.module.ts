import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PushDelivery } from "../entities/push-delivery.entity";
import { PushDevice } from "../entities/push-device.entity";
import { PushController, PushTestController } from "./push.controller";
import { PushService } from "./push.service";

@Module({
  imports: [TypeOrmModule.forFeature([PushDevice, PushDelivery])],
  controllers: [PushController, PushTestController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}

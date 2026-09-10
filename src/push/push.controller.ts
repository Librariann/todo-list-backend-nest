import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiResponse, success } from "../common/api-response";
import { User } from "../entities/user.entity";
import { RegisterPushDeviceDto } from "./dto/register-push-device.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import {
  NotificationPreferencesOutput,
  PushDeviceOutput,
  PushSendResult,
  PushService,
} from "./push.service";

@Controller("api/push/devices")
export class PushController {
  constructor(private readonly service: PushService) {}

  @Post()
  async register(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushDeviceDto,
  ): Promise<ApiResponse<PushDeviceOutput>> {
    const device = await this.service.register(user.id, dto);
    return success(device, "푸시 알림 기기가 등록되었습니다.");
  }

  @Delete(":installationId")
  async unregister(
    @CurrentUser() user: User,
    @Param("installationId") installationId: string,
  ): Promise<ApiResponse<string>> {
    await this.service.unregister(user.id, installationId);
    return success("OK", "푸시 알림 기기 등록이 해제되었습니다.");
  }
}

@Controller("api/push")
export class PushTestController {
  constructor(private readonly service: PushService) {}

  @Post("test")
  async sendTest(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<PushSendResult>> {
    const result = await this.service.sendToUser(user.id, {
      title: "GrowDo 테스트 알림",
      body: "Nest에서 보낸 푸시 알림이 정상적으로 도착했어요 🔔",
      type: "TEST",
      data: { screen: "todos", sentAt: new Date().toISOString() },
    });
    return success(result, "테스트 푸시 발송을 요청했습니다.");
  }
}

@Controller("api/push/preferences")
export class PushPreferencesController {
  constructor(private readonly service: PushService) {}

  @Get()
  async getPreferences(
    @CurrentUser() user: User,
  ): Promise<ApiResponse<NotificationPreferencesOutput>> {
    return success(
      await this.service.getPreferences(user.id),
      "알림 설정을 조회했습니다.",
    );
  }

  @Patch()
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<ApiResponse<NotificationPreferencesOutput>> {
    return success(
      await this.service.updatePreferences(user.id, dto),
      "알림 설정을 저장했습니다.",
    );
  }
}

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";
import {
  PushDelivery,
  PushDeliveryStatus,
} from "../entities/push-delivery.entity";
import { PushDevice, PushProvider } from "../entities/push-device.entity";
import { RegisterPushDeviceDto } from "./dto/register-push-device.dto";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_CHUNK_SIZE = 100;
const RECEIPT_CHUNK_SIZE = 1000;
const RECEIPT_CHECK_DELAY_MS = 15_000;
const RECEIPT_RETRY_DELAY_MS = 60_000;
const RECEIPT_MAX_ATTEMPTS = 20;

type ExpoErrorCode = string;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: ExpoErrorCode };
}

interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: ExpoErrorCode };
}

interface ExpoResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface ExpoPushPayload {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: string;
  data?: Record<string, unknown>;
}

export interface PushMessage {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  targetedDevices: number;
  accepted: number;
  failed: number;
}

export interface PushDeviceOutput {
  id: number;
  installationId: string;
  provider: PushDevice["provider"];
  platform: PushDevice["platform"];
  enabled: boolean;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private checkingReceipts = false;

  constructor(
    @InjectRepository(PushDevice)
    private readonly devices: Repository<PushDevice>,
    @InjectRepository(PushDelivery)
    private readonly deliveries: Repository<PushDelivery>,
    private readonly config: ConfigService,
  ) {}

  async register(
    userId: number,
    dto: RegisterPushDeviceDto,
  ): Promise<PushDeviceOutput> {
    let device = await this.devices.findOne({
      where: { installationId: dto.installationId },
    });
    device ??= await this.devices.findOne({ where: { token: dto.token } });
    device ??= this.devices.create();

    Object.assign(device, {
      ...dto,
      userId,
      deviceModel: dto.deviceModel ?? null,
      osVersion: dto.osVersion ?? null,
      appVersion: dto.appVersion ?? null,
      timezone: dto.timezone ?? null,
      enabled: true,
      lastRegisteredAt: new Date(),
    });

    return this.toOutput(await this.devices.save(device));
  }

  async unregister(userId: number, installationId: string): Promise<void> {
    const device = await this.devices.findOne({
      where: { userId, installationId },
    });
    if (!device) return;

    device.enabled = false;
    await this.devices.save(device);
  }

  async sendToUser(
    userId: number,
    message: PushMessage,
  ): Promise<PushSendResult> {
    const devices = await this.devices.find({
      where: { userId, enabled: true, provider: PushProvider.EXPO },
      order: { lastRegisteredAt: "DESC" },
    });
    const result: PushSendResult = {
      targetedDevices: devices.length,
      accepted: 0,
      failed: 0,
    };

    for (const deviceChunk of this.chunk(devices, SEND_CHUNK_SIZE)) {
      const payloads = deviceChunk.map((device) =>
        this.toExpoPayload(device.token, message),
      );
      const response = await this.postExpo<ExpoTicket[]>(
        EXPO_SEND_URL,
        payloads,
      );
      const tickets = response.data;
      if (!Array.isArray(tickets)) {
        throw new ServiceUnavailableException(
          response.errors?.[0]?.message ??
            "Expo 푸시 서비스가 잘못된 응답을 반환했습니다.",
        );
      }

      const newDeliveries: PushDelivery[] = [];
      const disabledDevices: PushDevice[] = [];
      const nextReceiptCheckAt = new Date(Date.now() + RECEIPT_CHECK_DELAY_MS);

      deviceChunk.forEach((device, index) => {
        const ticket = tickets[index];
        if (ticket?.status === "ok" && ticket.id) {
          result.accepted += 1;
          newDeliveries.push(
            this.deliveries.create({
              pushDeviceId: device.id,
              receiptId: ticket.id,
              notificationType: message.type,
              status: PushDeliveryStatus.PENDING,
              errorCode: null,
              errorMessage: null,
              receiptCheckAttempts: 0,
              nextReceiptCheckAt,
              checkedAt: null,
            }),
          );
          return;
        }

        result.failed += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") {
          device.enabled = false;
          disabledDevices.push(device);
        }
      });

      if (newDeliveries.length > 0) {
        await this.deliveries.save(newDeliveries);
      }
      if (disabledDevices.length > 0) {
        await this.devices.save(disabledDevices);
      }
    }

    return result;
  }

  @Interval(60_000)
  async checkPendingReceipts(): Promise<void> {
    if (this.checkingReceipts) return;
    this.checkingReceipts = true;

    try {
      const pending = await this.deliveries.find({
        where: {
          status: PushDeliveryStatus.PENDING,
          nextReceiptCheckAt: LessThanOrEqual(new Date()),
        },
        relations: { device: true },
        order: { nextReceiptCheckAt: "ASC" },
        take: RECEIPT_CHUNK_SIZE,
      });

      for (const deliveryChunk of this.chunk(pending, RECEIPT_CHUNK_SIZE)) {
        await this.checkReceiptChunk(deliveryChunk);
      }
    } catch (error) {
      this.logger.warn(
        `Expo 푸시 영수증 확인 실패: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`,
      );
    } finally {
      this.checkingReceipts = false;
    }
  }

  private async checkReceiptChunk(
    deliveryChunk: PushDelivery[],
  ): Promise<void> {
    if (deliveryChunk.length === 0) return;

    const response = await this.postExpo<Record<string, ExpoReceipt>>(
      EXPO_RECEIPTS_URL,
      { ids: deliveryChunk.map((delivery) => delivery.receiptId) },
    );
    const receipts = response.data ?? {};
    const devicesToDisable: PushDevice[] = [];
    const now = new Date();

    for (const delivery of deliveryChunk) {
      const receipt = receipts[delivery.receiptId];
      delivery.receiptCheckAttempts += 1;

      if (!receipt) {
        if (delivery.receiptCheckAttempts >= RECEIPT_MAX_ATTEMPTS) {
          delivery.status = PushDeliveryStatus.EXPIRED;
          delivery.checkedAt = now;
        } else {
          delivery.nextReceiptCheckAt = new Date(
            Date.now() + RECEIPT_RETRY_DELAY_MS,
          );
        }
        continue;
      }

      delivery.checkedAt = now;
      if (receipt.status === "ok") {
        delivery.status = PushDeliveryStatus.DELIVERED;
        continue;
      }

      delivery.status = PushDeliveryStatus.ERROR;
      delivery.errorCode = receipt.details?.error ?? null;
      delivery.errorMessage = receipt.message ?? null;

      if (
        receipt.details?.error === "DeviceNotRegistered" &&
        delivery.device.enabled
      ) {
        delivery.device.enabled = false;
        devicesToDisable.push(delivery.device);
      }
    }

    await this.deliveries.save(deliveryChunk);
    if (devicesToDisable.length > 0) {
      await this.devices.save(devicesToDisable);
    }
  }

  private toExpoPayload(token: string, message: PushMessage): ExpoPushPayload {
    return {
      to: token,
      title: message.title,
      body: message.body,
      sound: "default",
      priority: "high",
      channelId: "reminders",
      data: { type: message.type, ...message.data },
    };
  }

  private async postExpo<T>(
    url: string,
    body: unknown,
  ): Promise<ExpoResponse<T>> {
    const accessToken = this.config.get<string>("EXPO_ACCESS_TOKEN")?.trim();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        const responseBody = (await response.json()) as ExpoResponse<T>;
        if (response.ok) return responseBody;

        lastError = new Error(
          responseBody.errors?.[0]?.message ??
            `Expo 푸시 요청 실패 (${response.status})`,
        );
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        lastError = error;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }

    throw new ServiceUnavailableException(
      lastError instanceof Error
        ? lastError.message
        : "Expo 푸시 서비스에 연결할 수 없습니다.",
    );
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private toOutput(device: PushDevice): PushDeviceOutput {
    return {
      id: device.id,
      installationId: device.installationId,
      provider: device.provider,
      platform: device.platform,
      enabled: device.enabled,
    };
  }
}

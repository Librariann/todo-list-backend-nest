import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { SentryModule } from "@sentry/nestjs/setup";
import { TypeOrmModule } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { ChallengesModule } from "./challenges/challenges.module";
import { ApiExceptionFilter } from "./common/http-exception.filter";
import { SlackModule } from "./common/slack.module";
import { GoalsModule } from "./goals/goals.module";
import { HabitsModule } from "./habits/habits.module";
import { HealthModule } from "./health/health.module";
import { PointsModule } from "./points/points.module";
import { PushModule } from "./push/push.module";
import { RewardsModule } from "./rewards/rewards.module";
import { SummaryModule } from "./summary/summary.module";
import { TodosModule } from "./todos/todos.module";
import { UsersModule } from "./users/users.module";

const HEALTH_PATHS = new Set(["/health", "/health/detail"]);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? [`.env.${process.env.NODE_ENV}`, ".env"]
        : [".env"],
    }),
    SentryModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>("NODE_ENV") === "production";
        return {
          pinoHttp: {
            level: config.get<string>("LOG_LEVEL") ?? (isProduction ? "info" : "debug"),
            // 프로덕션은 Railway 로그 검색이 되도록 JSON, 로컬은 사람이 읽기 좋게.
            transport: isProduction
              ? undefined
              : { target: "pino-pretty", options: { singleLine: true } },
            // 프론트/모바일이 보낸 요청 ID 가 있으면 이어받아 클라이언트~서버를 연결한다.
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers["x-request-id"];
              const id =
                (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
              res.setHeader("x-request-id", id);
              return id;
            },
            customProps: (req: IncomingMessage) => ({
              userId: (req as { user?: { id?: number } }).user?.id,
            }),
            // 헬스체크는 1분마다 찍히므로 로그에서 제외한다.
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                HEALTH_PATHS.has((req.url ?? "").split("?")[0]),
            },
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers['set-cookie']",
              ],
              remove: true,
            },
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
            },
          },
        };
      },
    }),
    SlackModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        schema: config.get<string>("DB_SCHEMA", "todo_list"),
        autoLoadEntities: true,
        synchronize: true,
        logging: config.get<string>("DB_LOGGING") === "true",
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    PointsModule,
    PushModule,
    ChallengesModule,
    TodosModule,
    HabitsModule,
    GoalsModule,
    RewardsModule,
    SummaryModule,
  ],
  providers: [
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}

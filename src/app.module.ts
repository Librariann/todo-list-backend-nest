import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { ChallengesModule } from "./challenges/challenges.module";
import { GoalsModule } from "./goals/goals.module";
import { HabitsModule } from "./habits/habits.module";
import { PointsModule } from "./points/points.module";
import { RewardsModule } from "./rewards/rewards.module";
import { SummaryModule } from "./summary/summary.module";
import { TodosModule } from "./todos/todos.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? [`.env.${process.env.NODE_ENV}`, ".env"]
        : [".env"],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        schema: config.get<string>("DB_SCHEMA", "todo_list"),
        autoLoadEntities: true,
        synchronize: config.get<string>("DB_SYNC") === "true",
        logging: config.get<string>("DB_LOGGING") === "true",
      }),
    }),
    AuthModule,
    UsersModule,
    PointsModule,
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
  ],
})
export class AppModule {}

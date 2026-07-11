import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../entities/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OAuthService } from "./oauth.service";
import { OAuthHandoffService } from "./oauth-handoff.service";
import { RolesGuard } from "./roles.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get("JWT_SECRET") ??
          "development-secret-that-must-be-replaced-12345678901234567890",
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    OAuthHandoffService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, SessionService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}

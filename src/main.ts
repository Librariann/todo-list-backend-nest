// Sentry 계측은 다른 모듈보다 먼저 로드되어야 한다.
import "./instrument";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser = require("cookie-parser");
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? "http://localhost:3000")
      .split(",")
      .map((url) => url.trim().replace(/\/$/, ""))
      .filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    credentials: true,
    maxAge: 3600,
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = new DocumentBuilder()
    .setTitle("Growdo Backend API")
    .setDescription("Spring Boot 버전과 호환되는 NestJS API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "swagger-ui.html",
    app,
    SwaggerModule.createDocument(app, config),
    { jsonDocumentUrl: "api-docs" },
  );
  await app.listen(Number(process.env.PORT ?? 8080));
}
void bootstrap();

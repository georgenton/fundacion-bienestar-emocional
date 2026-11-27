import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, type RequestHandler } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { loadConfig } from "@fbe/config";
import { AppModule } from "./app.module.js";
import { getAuth } from "./auth/auth.js";
import { SafeExceptionFilter } from "./logging/safe-exception.filter.js";
import { SafeLogger } from "./logging/safe-logger.js";

export async function createApp() {
  const config = loadConfig();
  const logger = new SafeLogger();
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger });
  const express = app.getHttpAdapter().getInstance();

  express.use(
    cors({
      origin: config.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  );
  express.all("/api/auth/*splat", toNodeHandler(getAuth()));
  const clinicalHeaders: RequestHandler = (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store, private");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  };
  express.use(["/api/clinical", "/api/economy", "/api/portal"], clinicalHeaders);
  express.use(json({ limit: "64kb" }));

  app.useGlobalFilters(new SafeExceptionFilter(logger));
  await app.init();
  return app;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.apiPort, "0.0.0.0");
}

if (process.env.NODE_ENV !== "test") {
  void bootstrap();
}

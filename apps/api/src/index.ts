import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { loggerMiddleware } from "./middleware/logger";
import { healthRoutes } from "./routes/health";
import { chatRoutes } from "./routes/chat";
import { onboardingRoutes } from "./routes/onboarding";
import { briefingRoutes } from "./routes/briefing";
import { memoryRoutes } from "./routes/memory";
import { conversationRoutes } from "./routes/conversations";
import { insightRoutes } from "./routes/insights";
import { webhookRoutes } from "./routes/webhooks";
import { startScheduler } from "./jobs/scheduler";

const app = new Elysia()
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Webhook-Secret",
      ],
      exposeHeaders: [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
      ],
      credentials: true,
    }),
  )
  .use(loggerMiddleware)
  .onError(({ error, set }) => {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as any).message)
        : "Internal server error";

    const status = typeof set.status === "number" ? set.status : 500;

    if (status >= 500) {
      console.error("[error]", error);
    }

    return {
      error: {
        code: status === 429 ? "RATE_LIMIT_EXCEEDED" : status === 503 ? "AI_UNAVAILABLE" : "INTERNAL_ERROR",
        message,
        status,
      },
    };
  })
  .use(healthRoutes)
  .use(chatRoutes)
  .use(onboardingRoutes)
  .use(briefingRoutes)
  .use(memoryRoutes)
  .use(conversationRoutes)
  .use(insightRoutes)
  .use(webhookRoutes)
  .listen(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  startScheduler();
}

console.log(`Ally API running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;

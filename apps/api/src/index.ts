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
import { userRoutes } from "./routes/users";
import { profileRoutes } from "./routes/profile";
import { billingRoutes } from "./routes/billing";
import { familyRoutes } from "./routes/family";
import { calendarRoutes } from "./routes/calendar";
import { taskRoutes } from "./routes/tasks";
import { shoppingRoutes } from "./routes/shopping";
import { startScheduler } from "./jobs/scheduler";
import { startMemoryWorker } from "./services/memoryQueue";
import { ensureCollection } from "./services/vectorStore";
import { auth } from "./lib/auth";

const app = new Elysia()
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Webhook-Secret",
        "Cookie",
      ],
      exposeHeaders: [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Set-Cookie",
      ],
      credentials: true,
    }),
  )
  .use(loggerMiddleware)
  .all("/api/auth/*", async ({ request }) => {
    return auth.handler(request);
  })
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
  .use(userRoutes)
  .use(profileRoutes)
  .use(billingRoutes)
  .use(familyRoutes)
  .use(calendarRoutes)
  .use(taskRoutes)
  .use(shoppingRoutes)
  .listen(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  startScheduler();
  startMemoryWorker();
  ensureCollection()
    .then(() => console.log("[qdrant] Collection ready"))
    .catch((err) => console.error("[qdrant] Collection bootstrap failed:", err.message));
}

console.log(`Anzi API running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;

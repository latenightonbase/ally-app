import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { healthRoutes } from "../../routes/health";
import { chatRoutes } from "../../routes/chat";
import { onboardingRoutes } from "../../routes/onboarding";
import { briefingRoutes } from "../../routes/briefing";
import { memoryRoutes } from "../../routes/memory";
import { conversationRoutes } from "../../routes/conversations";
import { insightRoutes } from "../../routes/insights";
import { webhookRoutes } from "../../routes/webhooks";
import { reminderRoutes } from "../../routes/reminders";
import { taskRoutes } from "../../routes/tasks";

export function createTestApp() {
  return new Elysia()
    .use(cors({ origin: true }))
    .onError(({ error, set }) => {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as any).message)
          : "Internal server error";

      const status = typeof set.status === "number" ? set.status : 500;

      return {
        error: {
          code:
            status === 429
              ? "RATE_LIMIT_EXCEEDED"
              : status === 503
                ? "AI_UNAVAILABLE"
                : "INTERNAL_ERROR",
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
    .use(reminderRoutes)
    .use(taskRoutes);
}

export function request(
  app: ReturnType<typeof createTestApp>,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const { method = "GET", headers = {}, body } = options;

  const url = `http://localhost${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return app.handle(new Request(url, init));
}

export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function authedRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  token: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return request(app, path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

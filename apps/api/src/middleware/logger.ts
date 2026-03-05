import { Elysia } from "elysia";

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export const loggerMiddleware = new Elysia({ name: "logger" })
  .derive({ as: "global" }, () => {
    return { requestStart: performance.now() };
  })
  .onAfterResponse({ as: "global" }, ({ request, set, requestStart }) => {
    const duration = formatDuration(performance.now() - (requestStart ?? 0));
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const status = set.status ?? 200;

    const level = typeof status === "number" && status >= 400 ? "warn" : "info";
    const line = `${method} ${path} ${status} ${duration}`;

    if (level === "warn") {
      console.warn(`[http] ${line}`);
    } else {
      console.log(`[http] ${line}`);
    }
  })
  .onError({ as: "global" }, ({ request, error }) => {
    const method = request.method;
    const url = new URL(request.url);
    console.error(`[http] ${method} ${url.pathname} ERROR`, {
      message:
        error && typeof error === "object" && "message" in error
          ? (error as any).message
          : String(error),
    });
  });

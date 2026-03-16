type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

interface EventMap {
  "user:app_opened": { userId: string };
  "user:message_sent": { userId: string; conversationId: string; message: string };
  "user:inactive": { userId: string; inactiveDays: number };
  "user:mood_shift": { userId: string; direction: "declining" | "improving" };
  "user:goal_deadline": { userId: string; goalDescription: string };
  "reminder:due": { userId: string; reminderId: string; title: string };
  "system:daily_scan": Record<string, never>;
}

type EventName = keyof EventMap;

const handlers = new Map<string, Set<EventHandler<unknown>>>();

export function on<E extends EventName>(
  event: E,
  handler: EventHandler<EventMap[E]>,
): () => void {
  if (!handlers.has(event)) {
    handlers.set(event, new Set());
  }
  const set = handlers.get(event)!;
  set.add(handler as EventHandler<unknown>);

  return () => set.delete(handler as EventHandler<unknown>);
}

export function emit<E extends EventName>(
  event: E,
  payload: EventMap[E],
): void {
  const set = handlers.get(event);
  if (!set) return;

  for (const handler of set) {
    try {
      const result = handler(payload);
      if (result instanceof Promise) {
        result.catch((err) =>
          console.error(`[events] Handler error for ${event}:`, err),
        );
      }
    } catch (err) {
      console.error(`[events] Sync handler error for ${event}:`, err);
    }
  }
}

export function removeAllListeners(event?: EventName): void {
  if (event) {
    handlers.delete(event);
  } else {
    handlers.clear();
  }
}

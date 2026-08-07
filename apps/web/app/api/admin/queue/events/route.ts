import {
  projectionJobEvents,
} from "@wcarankings/projection-jobs";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function eventMessage() {
  return encoder.encode("event: queue\ndata: changed\n\n");
}

function keepAliveMessage() {
  return encoder.encode(": keep-alive\n\n");
}

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;

  const queueEvents = projectionJobEvents();

  try {
    await queueEvents.waitUntilReady();
  } catch (error) {
    await queueEvents.close();
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The projection queue is unavailable.",
      },
      { status: 503 },
    );
  }

  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const notify = () => controller?.enqueue(eventMessage());

  const close = () => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    queueEvents.off("waiting", notify);
    queueEvents.off("active", notify);
    queueEvents.off("completed", notify);
    queueEvents.off("failed", notify);
    queueEvents.off("stalled", notify);
    void queueEvents.close();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      queueEvents.on("waiting", notify);
      queueEvents.on("active", notify);
      queueEvents.on("completed", notify);
      queueEvents.on("failed", notify);
      queueEvents.on("stalled", notify);
      controller.enqueue(eventMessage());
      keepAlive = setInterval(
        () => controller?.enqueue(keepAliveMessage()),
        15_000,
      );
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel: close,
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}

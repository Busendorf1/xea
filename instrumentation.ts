import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      debug: false,
    });

    // Start background impression flush worker for high-throughput 500M+ batching
    try {
      const { startImpressionFlushWorker } = await import("@/lib/services/impressionFlushWorker");
      startImpressionFlushWorker();
    } catch (e) {
      console.warn("⚠️ Failed to start impression flush worker in instrumentation:", e);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

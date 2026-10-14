import * as Sentry from "@sentry/nextjs";

export function captureApiException(error: unknown, context?: {
  route?: string;
  email?: string;
  reference?: string;
  extra?: Record<string, any>;
}) {
  console.error(`[API Error: ${context?.route || "unknown"}]`, error);

  if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context?.route) scope.setTag("route", context.route);
      if (context?.email) scope.setUser({ email: context.email });
      if (context?.reference) scope.setTag("reference", context.reference);
      if (context?.extra) scope.setExtras(context.extra);

      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(String(error), "error");
      }
    });
  }
}

"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      Sentry.captureException(error);
    } catch {}
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: "2rem", textAlign: "center" }}>
        <h2>Something went wrong</h2>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1.5rem",
            borderRadius: "9999px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

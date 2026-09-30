"use client";

import React, { useEffect, useRef } from "react";

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: (error: string) => void;
  onExpire?: () => void;
  action?: string;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string;
          action?: string;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact" | "invisible";
          callback?: (token: string) => void;
          "error-callback"?: (error: any) => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

// Cloudflare official test site keys:
// "1x00000000000000000000AA" -> Always passes (invisible)
// "2x00000000000000000000AB" -> Always blocks
const DEFAULT_TEST_SITE_KEY = "1x00000000000000000000AA";

export default function TurnstileWidget({
  onVerify,
  onError,
  onExpire,
  action = "ad-earn",
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    DEFAULT_TEST_SITE_KEY;

  useEffect(() => {
    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          size: "invisible",
          theme: "auto",
          callback: (token: string) => {
            if (isMounted) onVerify(token);
          },
          "error-callback": (err: any) => {
            if (isMounted && onError) onError(String(err || "Turnstile challenge failed"));
          },
          "expired-callback": () => {
            if (isMounted && onExpire) onExpire();
          },
        });
        widgetIdRef.current = id;
      } catch (renderErr) {
        console.warn("⚠️ Turnstile render warning:", renderErr);
      }
    };

    // Check if script is already injected
    const SCRIPT_ID = "cf-turnstile-script";
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.turnstile) renderWidget();
      };
      document.head.appendChild(script);
    } else if (window.turnstile) {
      renderWidget();
    } else {
      script.addEventListener("load", renderWidget);
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }
    };
  }, [siteKey, action, onVerify, onError, onExpire]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ display: "none" }}
      aria-hidden="true"
    />
  );
}

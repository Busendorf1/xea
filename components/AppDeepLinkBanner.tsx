"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Smartphone, X } from "lucide-react";

const INTER_FONT_STACK = "'Inter', var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif";
const STORAGE_DISMISS_KEY = "paayh_app_banner_dismissed";
const DEFAULT_CANONICAL_ORIGIN = "https://paayh.com";
const ANDROID_PACKAGE = "com.paayh.app";
const IOS_CUSTOM_SCHEME = "xea-auth";

const EXCLUDED_PATH_PREFIXES = [
  "/auth",
  "/logout",
  "/api",
  "/modal",
  "/_next",
  "/.well-known",
];

export function shouldShowAppBanner({
  pathname,
  userAgent,
  dismissed,
}: {
  pathname?: string | null;
  userAgent?: string | null;
  dismissed?: boolean;
}): boolean {
  if (dismissed) return false;
  const ua = String(userAgent || "");
  if (!/Android|iPhone|iPad|iPod/i.test(ua)) return false;
  // Never show inside an embedded native Paayh WebView if tagged
  if (/PaayhApp/i.test(ua)) return false;
  const path = pathname || "/";
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return true;
}

export function buildPaayhOpenAppUrl({
  pathname,
  search,
  origin,
  userAgent,
  androidStoreUrl,
}: {
  pathname?: string | null;
  search?: string | null;
  origin?: string | null;
  userAgent?: string | null;
  androidStoreUrl?: string | null;
}): string {
  const safePath = pathname && pathname.startsWith("/") ? pathname : `/${pathname || ""}`;
  const normalizedQuery = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const cleanRelative = safePath.replace(/^\/+/, "");
  const schemeTarget = cleanRelative
    ? `${IOS_CUSTOM_SCHEME}://${cleanRelative}${normalizedQuery}`
    : `${IOS_CUSTOM_SCHEME}://feed${normalizedQuery}`;

  const ua = String(userAgent || "");
  if (/Android/i.test(ua)) {
    const baseOrigin = (origin || DEFAULT_CANONICAL_ORIGIN).replace(/\/+$/, "");
    const fallbackUrl =
      (androidStoreUrl || "").trim() || `${baseOrigin}${safePath}${normalizedQuery}`;
    return `intent://paayh.com${safePath}${normalizedQuery}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(
      fallbackUrl
    )};end`;
  }

  return schemeTarget;
}

export default function AppDeepLinkBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const [origin, setOrigin] = useState(DEFAULT_CANONICAL_ORIGIN);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    setUserAgent(ua);
    setOrigin(window.location?.origin || DEFAULT_CANONICAL_ORIGIN);

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_DISMISS_KEY) === "1";
    } catch {
      dismissed = false;
    }

    setShow(shouldShowAppBanner({ pathname, userAgent: ua, dismissed }));
  }, [pathname]);

  if (!show) return null;

  const qs = searchParams?.toString();
  const appUrl = buildPaayhOpenAppUrl({
    pathname,
    search: qs ? `?${qs}` : "",
    origin,
    userAgent,
    androidStoreUrl: process.env.NEXT_PUBLIC_ANDROID_APP_URL || "",
  });

  const dismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_DISMISS_KEY, "1");
    } catch {
      // Ignore sessionStorage failures in private browsing
    }
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Open in Paayh"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 9000,
        maxWidth: 420,
        margin: "0 auto",
        backgroundColor: "var(--card-bg, #ffffff)",
        color: "var(--foreground, #000000)",
        fontFamily: INTER_FONT_STACK,
        borderRadius: 20,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: "1px solid var(--card-border, #e5e5e5)",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.16)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "var(--foreground, #000000)",
              color: "var(--card-bg, #ffffff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Smartphone size={18} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: "-0.015em",
                color: "var(--foreground, #000000)",
              }}
            >
              Open in Paayh
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.35,
                color: "var(--text-muted, #525252)",
                marginTop: 2,
              }}
            >
              Continue in the Paayh app for a smoother experience.
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Dismiss open in app modal"
          onClick={dismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted, #525252)",
            cursor: "pointer",
            padding: 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a
          href={appUrl}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--foreground, #000000)",
            color: "var(--card-bg, #ffffff)",
            fontFamily: INTER_FONT_STACK,
            fontSize: 14,
            fontWeight: 600,
            padding: "11px 16px",
            borderRadius: 9999,
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Open App
        </a>
        <button
          type="button"
          onClick={dismiss}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            color: "var(--foreground, #000000)",
            fontFamily: INTER_FONT_STACK,
            fontSize: 14,
            fontWeight: 500,
            padding: "11px 16px",
            borderRadius: 9999,
            border: "1px solid var(--card-border, #e5e5e5)",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

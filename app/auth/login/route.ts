import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

export const dynamic = "force-dynamic";

const ALLOWED_CONNECTIONS = new Set([
  "google-oauth2",
  "apple",
  "facebook",
  "twitter",
  "windowslive",
  "Username-Password-Authentication",
]);

const ALLOWED_SCREEN_HINTS = new Set(["login", "signup"]);
const ALLOWED_PROMPTS = new Set(["login", "consent", "select_account"]);

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  // Strictly allow only same-origin relative paths (reject //evil.com, https://, javascript:, backslashes)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/";
  }
  try {
    const parsed = new URL(trimmed, "https://paayh.com");
    if (parsed.origin !== "https://paayh.com") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const rawConnection = (params.get("connection") || "").trim();
  const rawScreenHint = (params.get("screen_hint") || "").trim().toLowerCase();
  const rawPrompt = (params.get("prompt") || "").trim().toLowerCase();
  const rawLoginHint = (params.get("login_hint") || "").trim();

  const authorizationParameters: Record<string, string> = {
    scope: "openid profile email",
  };

  if (rawConnection && ALLOWED_CONNECTIONS.has(rawConnection)) {
    authorizationParameters.connection = rawConnection;
  }
  if (rawScreenHint && ALLOWED_SCREEN_HINTS.has(rawScreenHint)) {
    authorizationParameters.screen_hint = rawScreenHint;
  }
  if (rawPrompt && ALLOWED_PROMPTS.has(rawPrompt)) {
    authorizationParameters.prompt = rawPrompt;
  }
  if (rawLoginHint && rawLoginHint.length <= 254 && rawLoginHint.includes("@")) {
    authorizationParameters.login_hint = rawLoginHint;
  }

  const loginOptions = {
    authorizationParameters,
    returnTo: sanitizeReturnTo(params.get("returnTo")),
  };

  try {
    return await auth0.startInteractiveLogin(loginOptions);
  } catch (err: any) {
    console.warn("Auth0 startInteractiveLogin first attempt failed, retrying:", err?.message || err);
    return await auth0.startInteractiveLogin(loginOptions);
  }
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-auth",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: message, ...extra }, status);
}

export function isAdminEmail(email: string): boolean {
  const clean = email.toLowerCase().trim();
  const configured = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return (
    clean === "nonsom019@gmail.com" ||
    clean === "nonsom2023@gmail.com" ||
    configured.includes(clean)
  );
}

export const AFFILIATE_EMAILS = new Set([
  "nonsom019@gmail.com",
  "nonsom2023@gmail.com",
]);

export function sanitizeCsvArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    return val
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeEmailHash(email: string): Promise<string> {
  return await sha256Hex(`xea-pii-v1:${email.toLowerCase().trim()}`);
}

export async function computePhoneHash(phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, "");
  return await sha256Hex(`xea-phone-v1:${digits}`);
}

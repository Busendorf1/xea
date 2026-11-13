import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { corsHeaders, errorResponse } from "../_shared/cors.ts";
import {
  handleInitialize,
  handleTransfer,
  handleVerify,
  handleWalletPay,
} from "./handlers.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "initialize").toLowerCase().trim();

    const verifiedEmail = await getVerifiedUserEmail(req);
    const rawEmail = req.headers.get("x-user-email") || String(body?.email || "");
    const requestedEmail = rawEmail.toLowerCase().trim();

    if (!verifiedEmail) {
      return errorResponse("Please sign in again to complete this transaction.", 401);
    }

    if (
      verifiedEmail !== "service_role" &&
      requestedEmail &&
      verifiedEmail !== requestedEmail
    ) {
      return errorResponse("Session mismatch. Please sign in again.", 403);
    }

    const cleanEmail =
      verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;
    if (!cleanEmail) {
      return errorResponse("Authentication required.", 401);
    }

    if (action === "transfer") {
      return await handleTransfer(supabase, cleanEmail, body);
    }
    if (action === "wallet_pay") {
      return await handleWalletPay(supabase, cleanEmail, body);
    }
    if (action === "initialize") {
      return await handleInitialize(supabase, cleanEmail, body);
    }
    if (action === "verify") {
      return await handleVerify(supabase, cleanEmail, verifiedEmail, body);
    }

    return errorResponse("Unsupported payment action.", 400);
  } catch (err: unknown) {
    console.error("payments-action error:", err);
    return errorResponse(
      "Unable to process payment request right now. Please try again.",
      500,
    );
  }
});

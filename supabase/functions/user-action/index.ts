import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { corsHeaders, errorResponse } from "../_shared/cors.ts";
import {
  handleAgentNetwork,
  handleAgentOptOut,
  handleAgentRegister,
} from "./agent.ts";
import { handleDeactivateAccount } from "./deactivation.ts";
import {
  handleCancelMonetization,
  handleGetMonetization,
  handleResumeMonetization,
} from "./monetization.ts";
import {
  handleDeleteNotifications,
  handleGetNotifications,
  handleGetStatement,
  handleMarkNotificationsRead,
} from "./notificationsStatement.ts";
import { handleWalletPinAction, handleWalletPinStatus } from "./pin.ts";
import {
  handleCheckUsername,
  handleGetProfile,
  handleRecalibrateLocation,
  handleUpdateProfile,
} from "./profile.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "check_username") {
      return await handleCheckUsername(supabase, req, body);
    }

    // Zero-Trust caller verification for all authenticated user actions
    const verifiedEmail = await getVerifiedUserEmail(req);
    const requestedEmail = (
      req.headers.get("x-user-email") || String(body?.email || "")
    )
      .toLowerCase()
      .trim();

    if (!verifiedEmail) {
      return errorResponse("Please sign in again to continue.", 401);
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

    if (action === "get_profile") {
      return await handleGetProfile(supabase, cleanEmail, req);
    }
    if (action === "update_profile") {
      return await handleUpdateProfile(supabase, cleanEmail, body);
    }
    if (action === "recalibrate_location") {
      return await handleRecalibrateLocation(supabase, cleanEmail, body);
    }
    if (action === "wallet_pin_status") {
      return await handleWalletPinStatus(supabase, cleanEmail);
    }
    if (
      action === "wallet_pin_action" ||
      action === "setup" ||
      action === "verify" ||
      action === "change" ||
      action === "reset"
    ) {
      return await handleWalletPinAction(supabase, cleanEmail, action, body);
    }
    if (action === "get_notifications") {
      return await handleGetNotifications(supabase, cleanEmail);
    }
    if (action === "mark_notifications_read") {
      return await handleMarkNotificationsRead(supabase, cleanEmail, body);
    }
    if (action === "delete_notifications") {
      return await handleDeleteNotifications(supabase, cleanEmail, body);
    }
    if (action === "get_statement") {
      return await handleGetStatement(supabase, cleanEmail);
    }
    if (action === "get_monetization") {
      return await handleGetMonetization(supabase, cleanEmail);
    }
    if (action === "resume_monetization") {
      return await handleResumeMonetization(supabase, cleanEmail);
    }
    if (action === "cancel_monetization") {
      return await handleCancelMonetization(supabase, cleanEmail, body);
    }
    if (action === "deactivate_account") {
      return await handleDeactivateAccount(supabase, cleanEmail, body);
    }
    if (action === "agent_network") {
      return await handleAgentNetwork(supabase, cleanEmail, body);
    }
    if (action === "agent_register") {
      return await handleAgentRegister(supabase, cleanEmail, body);
    }
    if (action === "agent_opt_out") {
      return await handleAgentOptOut(supabase, cleanEmail, body);
    }

    return errorResponse("Unsupported user action.", 400);
  } catch (err: unknown) {
    console.error("user-action error:", err);
    return errorResponse("Try again later", 500);
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import {
  handlePauseOrCancel,
  handleRateListeners,
  handleRecordSeen,
  handleReportAd,
} from "./engagement.ts";
import { handleGetFeed, handleGetHighlights } from "./feed.ts";
import {
  handleBoostCampaignOrHighlight,
  handleListCampaigns,
  handleSubmitAd,
  handleSubmitHighlight,
} from "./manage.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "list_campaigns").toLowerCase().trim();

    if (action === "get_feed") {
      return await handleGetFeed(supabase, req, body);
    }
    if (action === "get_highlights") {
      return await handleGetHighlights(supabase, req, body);
    }

    // Zero-Trust caller verification for authenticated actions
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

    if (action === "submit_ad") {
      return await handleSubmitAd(supabase, cleanEmail, body);
    }
    if (action === "submit_highlight") {
      return await handleSubmitHighlight(supabase, cleanEmail, body);
    }
    if (
      action === "pause_ad" ||
      action === "pause_highlight" ||
      action === "cancel_ad" ||
      action === "delete_highlight"
    ) {
      return await handlePauseOrCancel(supabase, cleanEmail, action, body);
    }
    if (action === "boost_ad" || action === "boost_highlight") {
      return await handleBoostCampaignOrHighlight(supabase, cleanEmail, action, body);
    }
    if (action === "list_campaigns") {
      return await handleListCampaigns(supabase, cleanEmail);
    }
    if (action === "record_seen") {
      return await handleRecordSeen(supabase, cleanEmail, body);
    }
    if (action === "rate_listeners") {
      return await handleRateListeners(supabase, cleanEmail, body);
    }
    if (action === "report_ad") {
      return await handleReportAd(supabase, cleanEmail, body);
    }
    if (action === "business_subscribe_status") {
      const { data } = await supabase
        .from("business_subscribers")
        .select("*")
        .ilike("user_email", cleanEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return jsonResponse({ subscriber: data || null });
    }
    if (action === "business_subscribe_submit") {
      const { business_name, domain, contact_email } = body;
      const { data, error } = await supabase
        .from("business_subscribers")
        .insert([
          {
            user_email: cleanEmail,
            business_name,
            domain,
            contact_email: contact_email || cleanEmail,
            status: "pending",
          },
        ])
        .select()
        .maybeSingle();
      if (error) {
        return errorResponse("Unable to submit business registration right now.", 400);
      }
      return jsonResponse({ success: true, subscriber: data });
    }

    return errorResponse("Unsupported campaign action.", 400);
  } catch (err: unknown) {
    console.error("campaigns-action error:", err);
    return errorResponse(
      "Unable to process campaign request right now. Please try again.",
      500,
    );
  }
});

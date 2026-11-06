import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const action = String(body?.action || "").toLowerCase();
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const cleanEmail = rawEmail.toLowerCase().trim();

    if (!cleanEmail) {
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Submit Ad Campaign to Review Queue (`adds`)
    if (action === "submit_ad") {
      const adData = body?.adData || {};
      const editingId = body?.editingId || null;
      const adId = editingId || adData.id || crypto.randomUUID();

      const row: Record<string, any> = {
        id: adId,
        user_email: cleanEmail,
        ad_type: adData.adType || "business",
        industry: adData.industry || [],
        interest: adData.interest || [],
        lifestyle: adData.lifestyle || [],
        behavior: adData.behavior || [],
        personality: adData.personality || [],
        age_range: adData.ageRange || [18, 65],
        targeting_all: Boolean(adData.targetingAll),
        impressions: Number(adData.impressions || 1000),
        campaign_days: Number(adData.campaignDays || 5),
        user_frequency_cap: Number(adData.userFrequencyCap || 1),
        country: adData.country || null,
        state: adData.state || null,
        province: adData.province || null,
        gender: adData.gender || null,
        employment_status: adData.employmentStatus || null,
        ad_media_type: adData.adMediaType || "text",
        ad_content: adData.adContent || "",
        ad_action_buttons: adData.adActionButtons || [],
        action_phone: adData.actionPhone || null,
        action_whatsapp: adData.actionWhatsapp || null,
        action_website: adData.actionWebsite || null,
        action_email: adData.actionEmail || null,
        action_ios: adData.actionIos || null,
        action_android: adData.actionAndroid || null,
        action_watch_now: adData.actionWatchNow || null,
        cost_per_impression: Number(adData.costPerImpression || 25),
        total_cost: Number(adData.totalCost || 25000),
        ad_media: adData.adMedia || null,
        display_mutual_button: adData.displayMutualButton !== false,
        is_bidded: Boolean(adData.isBidded),
        bid_price: adData.bidPrice ? Number(adData.bidPrice) : null,
        custom_sponsor_name: adData.customSponsorName || null,
        custom_sponsor_handle: adData.customSponsorHandle || null,
        product_name: adData.productName || null,
        product_price: adData.productPrice ? Number(adData.productPrice) : null,
        product_cta_type: adData.productCtaType || null,
        product_cta_link: adData.productCtaLink || null,
        is_ai_content: Boolean(adData.isAiContent),
        status: "pending_review",
      };

      const { data, error } = editingId
        ? await supabase
            .from("adds")
            .update(row)
            .eq("id", editingId)
            .ilike("user_email", cleanEmail)
            .select()
            .maybeSingle()
        : await supabase.from("adds").insert([row]).select().maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          ad: data || row,
          message: "Campaign submitted for review.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Submit Highlight to Review Queue (`news`)
    if (action === "submit_highlight") {
      const h = body?.highlightData || {};
      const editingId = body?.editingId || null;
      const row: Record<string, any> = {
        user_email: cleanEmail,
        title: h.title || "",
        content: h.content || "",
        interest: h.interest || "General",
        image_url: h.image_url || h.imageUrl || null,
        country: h.country || null,
        state: h.state || null,
        province: h.province || null,
        campaign_days: Number(h.campaignDays || 1),
        is_bidded: Boolean(h.isBidded),
        bid_price: h.bidPrice ? Number(h.bidPrice) : null,
        custom_sponsor_name: h.customSponsorName || null,
        custom_sponsor_handle: h.customSponsorHandle || null,
        is_ai_content: Boolean(h.isAiContent),
        status: "pending_review",
      };

      const { data, error } = editingId
        ? await supabase
            .from("news")
            .update(row)
            .eq("id", editingId)
            .ilike("user_email", cleanEmail)
            .select()
            .maybeSingle()
        : await supabase.from("news").insert([row]).select().maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          highlight: data || row,
          message: "Highlight submitted for review.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Pause / Resume Ad Campaign
    if (action === "pause_ad") {
      const { adId, isPaused } = body;
      const { error } = await supabase
        .from("addsactive")
        .update({ is_paused: Boolean(isPaused) })
        .eq("id", adId)
        .ilike("user_email", cleanEmail);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ success: true, isPaused: Boolean(isPaused) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Pause / Resume Highlight
    if (action === "pause_highlight") {
      const { highlightId, isPaused } = body;
      const { error } = await supabase
        .from("newsactive")
        .update({ is_paused: Boolean(isPaused) })
        .eq("id", highlightId)
        .ilike("user_email", cleanEmail);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ success: true, isPaused: Boolean(isPaused) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Cancel Ad Campaign (Queue or Active with pro-rata wallet refund)
    if (action === "cancel_ad") {
      const { adId } = body;
      // Check queue first
      const { data: queuedAd } = await supabase
        .from("adds")
        .select("id")
        .eq("id", adId)
        .ilike("user_email", cleanEmail)
        .maybeSingle();

      if (queuedAd) {
        await supabase
          .from("adds")
          .delete()
          .eq("id", adId)
          .ilike("user_email", cleanEmail);
        return new Response(
          JSON.stringify({ success: true, refunded: 0 }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check active ads for pro-rata unused impression refund
      const { data: activeAd } = await supabase
        .from("addsactive")
        .select("*")
        .eq("id", adId)
        .ilike("user_email", cleanEmail)
        .maybeSingle();

      if (!activeAd) {
        return new Response(
          JSON.stringify({ error: "Campaign not found." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const totalImp = Number(activeAd.impressions || 0);
      const usedImp = Number(activeAd.impression_count || 0);
      const cpi = Number(activeAd.cost_per_impression || 25);
      const unusedImp = Math.max(0, totalImp - usedImp);
      const refundAmount = Math.round(unusedImp * cpi * 100) / 100;

      await supabase
        .from("addsactive")
        .delete()
        .eq("id", adId)
        .ilike("user_email", cleanEmail);

      if (refundAmount > 0) {
        const { data: userRow } = await supabase
          .from("users")
          .select("balance")
          .ilike("email", cleanEmail)
          .maybeSingle();
        const nextBalance =
          Math.round(((Number(userRow?.balance) || 0) + refundAmount) * 100) /
          100;
        await supabase
          .from("users")
          .update({ balance: nextBalance })
          .ilike("email", cleanEmail);
      }

      return new Response(
        JSON.stringify({ success: true, refunded: refundAmount }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. Delete Highlight Campaign
    if (action === "delete_highlight") {
      const { highlightId } = body;
      await Promise.all([
        supabase
          .from("news")
          .delete()
          .eq("id", highlightId)
          .ilike("user_email", cleanEmail),
        supabase
          .from("newsactive")
          .delete()
          .eq("id", highlightId)
          .ilike("user_email", cleanEmail),
      ]);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unsupported campaign action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

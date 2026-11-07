import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-user-authorization",
};

const KORA_BASE_URL =
  Deno.env.get("KORA_BASE_URL") || "https://api.korapay.com/merchant/api/v1";

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

    // Public-safe Feed & Active Highlights retrieval (works even if paayh.com is offline)
    if (action === "get_feed") {
      const limit = Math.min(50, Math.max(1, Number(body?.limit || 15)));
      const offset = Math.max(0, Number(body?.offset || 0));

      const { data: adsData } = await supabase
        .from("addsactive")
        .select("*")
        .is("completed_at", null)
        .eq("is_paused", false)
        .order("cost_per_impression", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const normalizedAds = (adsData || []).map((a: any) => ({
        ...a,
        displayMutualButton:
          a.displayMutualButton !== undefined
            ? a.displayMutualButton
            : a.display_mutual_button !== false,
      }));

      const emails = Array.from(
        new Set(normalizedAds.map((a: any) => a.user_email).filter(Boolean))
      );
      const profilesMap: Record<string, any> = {};
      if (emails.length > 0) {
        const { data: profiles } = await supabase
          .from("users")
          .select(
            'email, username, business_name, "firstName", "lastName", "profileImage", bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role'
          )
          .in("email", emails);

        for (const p of (profiles || []) as any[]) {
          if (p.email) {
            const safeProfile = { ...p };
            if (
              typeof safeProfile.firstName === "string" &&
              safeProfile.firstName.startsWith("enc:v1:")
            ) {
              safeProfile.firstName = "";
            }
            if (
              typeof safeProfile.lastName === "string" &&
              safeProfile.lastName.startsWith("enc:v1:")
            ) {
              safeProfile.lastName = "";
            }
            profilesMap[p.email.toLowerCase()] = safeProfile;
          }
        }
      }

      return new Response(
        JSON.stringify({ ads: normalizedAds, profiles: profilesMap }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "get_highlights") {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("newsactive")
        .select(
          "id, title, content, image_url, interest, created_at, is_ai_content"
        )
        .eq("is_paused", false)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(15);

      return new Response(JSON.stringify(data || []), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Zero-Trust caller verification
    const verifiedEmail = await getVerifiedUserEmail(req);
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const requestedEmail = rawEmail.toLowerCase().trim();

    if (!verifiedEmail) {
      return new Response(
        JSON.stringify({ error: "Please sign in again to continue." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      verifiedEmail !== "service_role" &&
      requestedEmail &&
      verifiedEmail !== requestedEmail
    ) {
      return new Response(
        JSON.stringify({
          error: "Session mismatch. Please sign in again.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanEmail =
      verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;

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

      if (editingId) {
        const [{ data: existingDraft }, { data: existingActive }] =
          await Promise.all([
            supabase
              .from("adds")
              .select("id, user_email")
              .eq("id", editingId)
              .maybeSingle(),
            supabase
              .from("addsactive")
              .select("id, user_email")
              .eq("id", editingId)
              .maybeSingle(),
          ]);

        const ownerEmail = (
          existingDraft?.user_email ||
          existingActive?.user_email ||
          ""
        )
          .toLowerCase()
          .trim();

        if (ownerEmail && ownerEmail !== cleanEmail) {
          return new Response(
            JSON.stringify({
              error: "You do not have permission to edit this campaign.",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

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
        product_name: adData.productName || null,
        product_price: adData.productPrice ? Number(adData.productPrice) : null,
        product_cta_type: adData.productCtaType || null,
        product_cta_link: adData.productCtaLink || null,
        is_ai_content: Boolean(adData.isAiContent),
        is_bidded: Boolean(adData.isBidded),
        bid_price: adData.bidPrice ? Number(adData.bidPrice) : null,
        status: "pending_review",
        admin_statement: "Status: Pending review",
        approved_at: null,
        is_paused: false,
      };

      let { data, error } = editingId
        ? await supabase
            .from("adds")
            .upsert(row, { onConflict: "id" })
            .select()
            .maybeSingle()
        : await supabase.from("adds").insert([row]).select().maybeSingle();

      if (error) {
        // Fallback if optional columns (`status`, `approved_at`) are not yet migrated
        const fallbackRow = { ...row };
        delete fallbackRow.status;
        delete fallbackRow.approved_at;
        const retry = editingId
          ? await supabase
              .from("adds")
              .upsert(fallbackRow, { onConflict: "id" })
              .select()
              .maybeSingle()
          : await supabase
              .from("adds")
              .insert([fallbackRow])
              .select()
              .maybeSingle();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return new Response(
          JSON.stringify({
            error: "Could not submit campaign. Please check your details and try again.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Create user notification
      try {
        await supabase.from("notifications").insert([
          {
            user_email: cleanEmail,
            title: editingId ? "Ad In Review" : "Ad Submitted",
            message: editingId
              ? "Your updated ad is in review. Pay in My Ads once approved."
              : "Your ad is in review. Once approved, pay in My Ads to go live.",
            read: false,
          },
        ]);
      } catch {}

      const resultAd = {
        ...(data || row),
        status: "pending_review",
        admin_statement: "Status: Pending review",
        approved_at: null,
        is_paused: false,
      };

      return new Response(
        JSON.stringify({
          success: true,
          ad: resultAd,
          status: "pending_review",
          admin_statement: "Status: Pending review",
          message: editingId
            ? "Campaign updated and placed in review."
            : "Campaign submitted for review.",
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
      const highlightId = editingId || h.id || crypto.randomUUID();

      if (editingId) {
        const [{ data: existingDraft }, { data: existingActive }] =
          await Promise.all([
            supabase
              .from("news")
              .select("id, user_email")
              .eq("id", editingId)
              .maybeSingle(),
            supabase
              .from("newsactive")
              .select("id, user_email")
              .eq("id", editingId)
              .maybeSingle(),
          ]);

        const ownerEmail = (
          existingDraft?.user_email ||
          existingActive?.user_email ||
          ""
        )
          .toLowerCase()
          .trim();

        if (ownerEmail && ownerEmail !== cleanEmail) {
          return new Response(
            JSON.stringify({
              error: "You do not have permission to edit this highlight.",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      const row: Record<string, any> = {
        id: highlightId,
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
        admin_statement: "Status: Pending review",
        approved_at: null,
        is_paused: false,
      };

      let { data, error } = editingId
        ? await supabase
            .from("news")
            .upsert(row, { onConflict: "id" })
            .select()
            .maybeSingle()
        : await supabase.from("news").insert([row]).select().maybeSingle();

      if (error) {
        const fallbackRow = { ...row };
        delete fallbackRow.status;
        delete fallbackRow.approved_at;
        const retry = editingId
          ? await supabase
              .from("news")
              .upsert(fallbackRow, { onConflict: "id" })
              .select()
              .maybeSingle()
          : await supabase
              .from("news")
              .insert([fallbackRow])
              .select()
              .maybeSingle();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return new Response(
          JSON.stringify({
            error: "Could not submit highlight. Please check your details and try again.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        await supabase.from("notifications").insert([
          {
            user_email: cleanEmail,
            title: editingId ? "Highlight In Review" : "Highlight Submitted",
            message: editingId
              ? "Your updated highlight is in review. Pay in My Highlights once approved."
              : "Your highlight is in review. Once approved, pay in My Highlights to go live.",
            read: false,
          },
        ]);
      } catch {}

      const resultHighlight = {
        ...(data || row),
        status: "pending_review",
        admin_statement: "Status: Pending review",
        approved_at: null,
        is_paused: false,
      };

      return new Response(
        JSON.stringify({
          success: true,
          highlight: resultHighlight,
          status: "pending_review",
          admin_statement: "Status: Pending review",
          message: editingId
            ? "Highlight updated and placed in review."
            : "Highlight submitted for review.",
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
      const [activeRes, addsRes] = await Promise.all([
        supabase
          .from("addsactive")
          .update({ is_paused: Boolean(isPaused) })
          .eq("id", adId)
          .eq("user_email", cleanEmail),
        supabase
          .from("adds")
          .update({ is_paused: Boolean(isPaused) })
          .eq("id", adId)
          .eq("user_email", cleanEmail),
      ]);

      if (activeRes.error && addsRes.error) {
        return new Response(
          JSON.stringify({ error: "Could not update campaign status." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
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
      const [activeRes, newsRes] = await Promise.all([
        supabase
          .from("newsactive")
          .update({ is_paused: Boolean(isPaused) })
          .eq("id", highlightId)
          .eq("user_email", cleanEmail),
        supabase
          .from("news")
          .update({ is_paused: Boolean(isPaused) })
          .eq("id", highlightId)
          .eq("user_email", cleanEmail),
      ]);

      if (activeRes.error && newsRes.error) {
        return new Response(
          JSON.stringify({ error: "Could not update highlight status." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ success: true, isPaused: Boolean(isPaused) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Cancel / Delete Ad Campaign (Non-refundable policy: archives active ads to completed_ads)
    if (action === "cancel_ad") {
      const { adId } = body;
      // Check review queue first
      const { data: queuedAd } = await supabase
        .from("adds")
        .select("id")
        .eq("id", adId)
        .eq("user_email", cleanEmail)
        .maybeSingle();

      // Check active ads
      const { data: activeAd } = await supabase
        .from("addsactive")
        .select("*")
        .eq("id", adId)
        .eq("user_email", cleanEmail)
        .maybeSingle();

      if (activeAd) {
        // Archive to completed_ads and remove from addsactive + adds
        try {
          await supabase.from("completed_ads").upsert(
            [
              {
                ...activeAd,
                is_paused: true,
                completed_at: new Date().toISOString(),
              },
            ],
            { onConflict: "id" }
          );
        } catch {}

        await Promise.all([
          supabase
            .from("addsactive")
            .delete()
            .eq("id", adId)
            .eq("user_email", cleanEmail),
          supabase
            .from("adds")
            .delete()
            .eq("id", adId)
            .eq("user_email", cleanEmail),
        ]);

        return new Response(
          JSON.stringify({
            success: true,
            refunded: 0,
            message: "Campaign stopped and moved to completed campaigns.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (queuedAd) {
        await supabase
          .from("adds")
          .delete()
          .eq("id", adId)
          .eq("user_email", cleanEmail);
        return new Response(
          JSON.stringify({
            success: true,
            refunded: 0,
            message: "Campaign removed.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check completed_ads deletion
      await supabase
        .from("completed_ads")
        .delete()
        .eq("id", adId)
        .eq("user_email", cleanEmail);

      return new Response(
        JSON.stringify({ success: true, refunded: 0 }),
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
          .eq("user_email", cleanEmail),
        supabase
          .from("newsactive")
          .delete()
          .eq("id", highlightId)
          .eq("user_email", cleanEmail),
      ]);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Boost / Top-Up Ad or Highlight Campaign
    if (action === "boost_ad" || action === "boost_highlight") {
      const {
        adId,
        highlightId,
        campaignType,
        additionalImpressions = 0,
        additionalDays = 0,
        newCostPerImpression,
        newBidPrice,
        paymentMethod = "wallet",
        callbackUrl = "xea-auth://payment-callback",
        userFrequencyCap,
        gender,
        country,
        state,
        province,
        industry,
        interest,
      } = body;

      const targetId = adId || highlightId;
      if (!targetId) {
        return new Response(
          JSON.stringify({ error: "Campaign ID is required." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Locate campaign across addsactive, adds, completed_ads, newsactive, news
      const [
        { data: activeAd },
        { data: queuedAd },
        { data: completedAd },
        { data: activeNews },
        { data: queuedNews },
      ] = await Promise.all([
        supabase
          .from("addsactive")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
        supabase
          .from("adds")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
        supabase
          .from("completed_ads")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
        supabase
          .from("newsactive")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
        supabase
          .from("news")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
      ]);

      const isHighlight =
        action === "boost_highlight" ||
        campaignType === "highlight" ||
        Boolean(activeNews || queuedNews);

      const campaign = isHighlight
        ? activeNews || queuedNews
        : activeAd || queuedAd || completedAd;

      if (!campaign) {
        return new Response(
          JSON.stringify({ error: "Campaign not found." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (
        String(campaign.user_email || "").toLowerCase().trim() !== cleanEmail
      ) {
        return new Response(
          JSON.stringify({ error: "Access denied. You do not own this campaign." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (campaign.is_paused && !completedAd) {
        return new Response(
          JSON.stringify({
            error: "Campaign is currently paused. Please resume it first to boost.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const addImpNum = Math.max(0, Number(additionalImpressions || 0));
      const addDaysNum = Math.max(0, Number(additionalDays || 0));
      const requestedRate = newCostPerImpression ?? newBidPrice;

      let totalCost = 0;
      let effectiveCpi = 25;
      let effectiveDailyRate = 1000;

      if (isHighlight) {
        const currentDaily =
          campaign.is_bidded && Number(campaign.bid_price || 0) >= 1000
            ? Number(campaign.bid_price)
            : 1000;
        effectiveDailyRate =
          requestedRate && Number(requestedRate) > currentDaily
            ? Number(requestedRate)
            : currentDaily;
        const rateIncrease = Math.max(0, effectiveDailyRate - currentDaily);
        const currentDays = Math.max(1, Number(campaign.campaign_days || 1));
        totalCost =
          Math.round(
            (addDaysNum * effectiveDailyRate + rateIncrease * currentDays) * 100
          ) / 100;
      } else {
        const currentCpi = Math.max(15, Number(campaign.cost_per_impression || 25));
        effectiveCpi =
          requestedRate && Number(requestedRate) > currentCpi
            ? Number(requestedRate)
            : currentCpi;
        const remainingImp = Math.max(
          1,
          Number(campaign.impressions || 1000) - Number(campaign.impression_count || 0)
        );
        totalCost =
          addImpNum > 0
            ? Math.round(addImpNum * effectiveCpi * 100) / 100
            : effectiveCpi > currentCpi
            ? Math.round((effectiveCpi - currentCpi) * remainingImp * 100) / 100
            : 0;
      }

      // If totalCost > 0 and paymentMethod is card/gateway, initialize Kora/Paystack checkout
      if (totalCost > 0 && paymentMethod !== "wallet") {
        const koraSecretKey = (
          Deno.env.get("KORA_SECRET_KEY") ||
          Deno.env.get("KORAPAY_SECRET_KEY") ||
          ""
        ).trim();
        const paystackSecretKey = (
          Deno.env.get("PAYSTACK_SECRET_KEY") || ""
        ).trim();
        const payoutProvider = (Deno.env.get("PAYOUT_PROVIDER") || "kora")
          .toLowerCase()
          .trim();

        const payType = isHighlight ? "boost_highlight" : "boost_campaign";
        const boostMeta = {
          type: payType,
          ad_id: targetId,
          highlight_id: targetId,
          additional_impressions: addImpNum,
          additional_days: addDaysNum,
          cost_per_impression: isHighlight ? effectiveDailyRate : effectiveCpi,
          bid_price: isHighlight ? effectiveDailyRate : effectiveCpi,
          user_email: cleanEmail,
        };

        if (koraSecretKey && payoutProvider !== "paystack") {
          try {
            const koraRef = `kora_boost_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
            const buildKoraBody = (redirectTarget: string) =>
              JSON.stringify({
                amount: totalCost,
                currency: "NGN",
                reference: koraRef,
                narration: `Paayh Campaign Boost`,
                redirect_url: redirectTarget,
                notification_url: "https://paayh.com/api/payments/kora-webhook",
                customer: {
                  name: cleanEmail.split("@")[0] || "Paayh Advertiser",
                  email: cleanEmail,
                },
                metadata: boostMeta,
              });

            let koraRes = await fetch(`${KORA_BASE_URL}/charges/initialize`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${koraSecretKey}`,
                "Content-Type": "application/json",
              },
              body: buildKoraBody(callbackUrl),
            });
            let koraJson = await koraRes.json();

            if (
              (!koraRes.ok || !koraJson?.status) &&
              callbackUrl &&
              !callbackUrl.startsWith("http://") &&
              !callbackUrl.startsWith("https://")
            ) {
              const bounceUrl = `https://paayh.com/api/payments/mobile-callback?redirect=${encodeURIComponent(
                callbackUrl
              )}`;
              koraRes = await fetch(`${KORA_BASE_URL}/charges/initialize`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${koraSecretKey}`,
                  "Content-Type": "application/json",
                },
                body: buildKoraBody(bounceUrl),
              });
              koraJson = await koraRes.json();
            }

            if (koraRes.ok && koraJson?.status && koraJson?.data?.checkout_url) {
              const finalRef = koraJson.data.reference || koraRef;
              await supabase.from("payments").insert([
                {
                  user_email: cleanEmail,
                  reference: finalRef,
                  amount: totalCost,
                  status: "pending",
                  type: payType,
                  description: `Boost checkout for #${targetId.substring(0, 8)}`,
                  metadata: boostMeta,
                },
              ]);
              return new Response(
                JSON.stringify({
                  success: true,
                  requiresCheckout: true,
                  provider: "kora",
                  paymentUrl: koraJson.data.checkout_url,
                  authorization_url: koraJson.data.checkout_url,
                  checkout_url: koraJson.data.checkout_url,
                  reference: finalRef,
                  totalCost,
                }),
                {
                  status: 200,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
              );
            }
          } catch {}
        }

        if (paystackSecretKey) {
          const psRes = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: cleanEmail,
                amount: Math.round(totalCost * 100),
                callback_url: callbackUrl,
                metadata: boostMeta,
              }),
            }
          );
          const psJson = await psRes.json();
          if (psRes.ok && psJson?.status && psJson?.data?.authorization_url) {
            await supabase.from("payments").insert([
              {
                user_email: cleanEmail,
                reference: psJson.data.reference,
                amount: totalCost,
                status: "pending",
                type: payType,
                description: `Boost checkout for #${targetId.substring(0, 8)}`,
                metadata: boostMeta,
              },
            ]);
            return new Response(
              JSON.stringify({
                success: true,
                requiresCheckout: true,
                provider: "paystack",
                paymentUrl: psJson.data.authorization_url,
                authorization_url: psJson.data.authorization_url,
                checkout_url: psJson.data.authorization_url,
                reference: psJson.data.reference,
                totalCost,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        }

        return new Response(
          JSON.stringify({
            error: "Unable to initialize card checkout right now. Please try wallet payment.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Wallet payment path when totalCost > 0
      let newBalance: number | undefined = undefined;
      if (totalCost > 0) {
        const reference = `wallet_boost_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const payType = isHighlight ? "boost_highlight" : "boost_campaign";

        // 1. Primary: Atomic PostgreSQL RPC (`spend_wallet_balance_atomic`)
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          "spend_wallet_balance_atomic",
          {
            p_user_email: cleanEmail,
            p_amount: totalCost,
            p_reason: payType,
            p_reference: reference,
          }
        );

        if (!rpcErr && rpcRes) {
          if (!rpcRes.success) {
            return new Response(
              JSON.stringify({
                error:
                  rpcRes.error ||
                  `Insufficient wallet balance. Required: ₦${totalCost.toLocaleString()}.`,
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          newBalance = Number(rpcRes.new_balance ?? 0);
        } else {
          // 2. Fallback: Case-insensitive user lookup + conditional balance update
          const { data: userRow } = await supabase
            .from("users")
            .select("id, balance")
            .ilike("email", cleanEmail)
            .maybeSingle();

          const currentBalance = Number(userRow?.balance || 0);
          if (!userRow || currentBalance < totalCost) {
            return new Response(
              JSON.stringify({
                error: `Insufficient wallet balance. Required: ₦${totalCost.toLocaleString()}.`,
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          const nextBalance = Math.round((currentBalance - totalCost) * 100) / 100;
          const { data: updatedUser, error: deductErr } = await supabase
            .from("users")
            .update({ balance: nextBalance })
            .eq("id", userRow.id)
            .gte("balance", totalCost)
            .select("balance")
            .maybeSingle();

          if (deductErr || !updatedUser) {
            return new Response(
              JSON.stringify({
                error: "Insufficient wallet balance or concurrent transaction in progress.",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          newBalance = Number(updatedUser.balance ?? nextBalance);
        }

        try {
          await supabase.from("payments").insert([
            {
              user_email: cleanEmail,
              reference,
              amount: totalCost,
              status: "success",
              type: payType,
              description: `Boost top-up for ${isHighlight ? "Highlight" : "Ad"} #${targetId.substring(0, 8)}`,
              metadata: {
                ad_id: targetId,
                highlight_id: targetId,
                type: payType,
                additional_impressions: addImpNum,
                additional_days: addDaysNum,
                cost_per_impression: isHighlight ? effectiveDailyRate : effectiveCpi,
                payment_method: "wallet",
              },
            },
          ]);
        } catch {}
      }

      if (isHighlight) {
        const highlightUpdate: Record<string, any> = {
          is_paused: false,
          campaign_days: Number(campaign.campaign_days || 1) + addDaysNum,
        };
        if (effectiveDailyRate > 1000) {
          highlightUpdate.is_bidded = true;
          highlightUpdate.bid_price = effectiveDailyRate;
        }
        if (country !== undefined) highlightUpdate.country = country;
        if (state !== undefined) highlightUpdate.state = state;
        if (province !== undefined) highlightUpdate.province = province;
        if (interest) {
          highlightUpdate.interest = Array.isArray(interest)
            ? interest[0] || "General"
            : interest;
        }

        await Promise.all([
          supabase
            .from("news")
            .update(highlightUpdate)
            .eq("id", targetId),
          supabase
            .from("newsactive")
            .update(highlightUpdate)
            .eq("id", targetId),
        ]);
      } else {
        const activeUpdatePayload: Record<string, any> = {
          is_paused: false,
          completed_at: null,
          cost_per_impression: effectiveCpi,
        };
        if (addImpNum > 0) {
          activeUpdatePayload.impressions =
            Number(campaign.impressions || 1000) + addImpNum;
        }
        if (addDaysNum > 0) {
          activeUpdatePayload.campaign_days =
            Number(campaign.campaign_days || 1) + addDaysNum;
        }
        if (userFrequencyCap) {
          activeUpdatePayload.user_frequency_cap = Number(userFrequencyCap);
        }
        if (gender !== undefined) activeUpdatePayload.gender = gender;
        if (country !== undefined) activeUpdatePayload.country = country;
        if (state !== undefined) activeUpdatePayload.state = state;
        if (province !== undefined) activeUpdatePayload.province = province;
        if (industry) {
          activeUpdatePayload.industry = Array.isArray(industry)
            ? industry
            : [industry];
        }
        if (interest) {
          activeUpdatePayload.interest = Array.isArray(interest)
            ? interest
            : [interest];
        }

        const queueUpdatePayload: Record<string, any> = {
          ...activeUpdatePayload,
          is_bidded: effectiveCpi > 25,
          bid_price: effectiveCpi > 25 ? effectiveCpi : campaign.bid_price,
        };
        if (totalCost > 0) {
          queueUpdatePayload.total_cost =
            Number(campaign.total_cost || 0) + totalCost;
        }

        // If boosting a completed ad, reactivate it back into addsactive!
        if (completedAd && !activeAd && addImpNum > 0) {
          const {
            status: _s,
            approved_at: _a,
            payment_status: _p,
            is_bidded: _ib,
            bid_price: _bp,
            total_cost: _tc,
            ...cleanCompleted
          } = completedAd;
          const reactivatedAd = {
            ...cleanCompleted,
            ...activeUpdatePayload,
            is_paused: false,
            completed_at: null,
            created_at: new Date().toISOString(),
          };
          await Promise.all([
            supabase
              .from("addsactive")
              .upsert([reactivatedAd], { onConflict: "id" }),
            supabase
              .from("adds")
              .update(queueUpdatePayload)
              .eq("id", targetId),
            supabase
              .from("completed_ads")
              .delete()
              .eq("id", targetId),
          ]);
        } else {
          await Promise.all([
            supabase
              .from("adds")
              .update(queueUpdatePayload)
              .eq("id", targetId),
            supabase
              .from("addsactive")
              .update(activeUpdatePayload)
              .eq("id", targetId),
          ]);
        }

        if (effectiveCpi > 25) {
          try {
            const adIndustry = (
              campaign.ad_type ||
              (Array.isArray(campaign.industry)
                ? campaign.industry[0]
                : campaign.industry) ||
              "business"
            ).toLowerCase();
            await supabase.from("bidded_ads").delete().eq("ad_id", targetId);
            await supabase.from("bidded_ads").insert([
              {
                ad_id: targetId,
                user_email: cleanEmail,
                industry: adIndustry,
                bid_price: effectiveCpi,
                is_active: true,
              },
            ]);
          } catch {}
        }
      }

      const boostedAt = new Date().toISOString();
      if (totalCost > 0) {
        try {
          await supabase.from("notifications").insert([
            {
              user_email: cleanEmail,
              title: isHighlight ? "Highlight Boosted" : "Campaign Boosted",
              message: `Boosted with ₦${totalCost.toLocaleString()}! Priority delivery is now active.`,
              read: false,
              created_at: boostedAt,
            },
          ]);
        } catch {}
      }

      return new Response(
        JSON.stringify({
          success: true,
          totalCost,
          boostedAmount: totalCost,
          boostedAt,
          newBalance,
          paymentMethod,
          message:
            totalCost > 0
              ? `Boosted with ₦${totalCost.toLocaleString()}! Priority delivery is now active.`
              : "Campaign settings updated!",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 8. List User's Campaigns (Ads Queue, Active Ads, Completed 72h Ads, Highlights Queue, Active Highlights, Rated IDs)
    if (action === "list_campaigns") {
      const seventyTwoHoursAgo = new Date(
        Date.now() - 72 * 60 * 60 * 1000
      ).toISOString();
      const [
        adsQueueRes,
        adsActiveRes,
        adsCompletedRes,
        highlightsQueueRes,
        highlightsActiveRes,
        ratingsRes,
        boostPaymentsRes,
      ] = await Promise.all([
        supabase
          .from("adds")
          .select("*")
          .ilike("user_email", cleanEmail)
          .order("created_at", { ascending: false }),
        supabase
          .from("addsactive")
          .select("*")
          .ilike("user_email", cleanEmail)
          .order("created_at", { ascending: false }),
        supabase
          .from("completed_ads")
          .select("*")
          .ilike("user_email", cleanEmail)
          .gte("completed_at", seventyTwoHoursAgo)
          .order("completed_at", { ascending: false })
          .limit(50),
        supabase
          .from("news")
          .select("*")
          .ilike("user_email", cleanEmail)
          .order("created_at", { ascending: false }),
        supabase
          .from("newsactive")
          .select("*")
          .ilike("user_email", cleanEmail)
          .order("created_at", { ascending: false }),
        supabase
          .from("completed_ads_ratings")
          .select("ad_id")
          .ilike("advertiser_email", cleanEmail),
        supabase
          .from("payments")
          .select("amount, created_at, type, metadata")
          .ilike("user_email", cleanEmail)
          .eq("status", "success")
          .in("type", ["boost_campaign", "boost_highlight", "boost"])
          .order("created_at", { ascending: false })
          .limit(150),
      ]);

      const boostMap: Record<string, { boosted_amount: number; boosted_at: string }> = {};
      if (boostPaymentsRes.data) {
        for (const p of boostPaymentsRes.data) {
          const meta =
            typeof p.metadata === "object" && p.metadata !== null
              ? (p.metadata as Record<string, any>)
              : {};
          const targetId = String(
            meta.ad_id || meta.adId || meta.highlight_id || meta.highlightId || ""
          );
          if (targetId && !boostMap[targetId]) {
            boostMap[targetId] = {
              boosted_amount: Number(p.amount || 0),
              boosted_at: p.created_at,
            };
          }
        }
      }

      const attachBoost = (list: any[]) =>
        (list || []).map((item) => {
          if (!item || !item.id) return item;
          const b = boostMap[String(item.id)];
          if (!b) return item;
          return {
            ...item,
            is_boosted: true,
            boosted_amount: b.boosted_amount,
            boosted_at: b.boosted_at,
          };
        });

      return new Response(
        JSON.stringify({
          adsQueue: attachBoost(adsQueueRes.data || []),
          adsActive: attachBoost([
            ...(adsActiveRes.data || []),
            ...(adsCompletedRes.data || []),
          ]),
          highlightsQueue: attachBoost(highlightsQueueRes.data || []),
          highlightsActive: attachBoost(highlightsActiveRes.data || []),
          ratedAdIds: (ratingsRes.data || []).map((r: any) => r.ad_id),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 9. Record Ad Seen (Non-monetized human view + 300-click progress)
    if (action === "record_seen") {
      const adId = String(body?.adId || "").trim();
      if (!adId) {
        return new Response(
          JSON.stringify({ error: "Ad ID is required." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const [{ data: seenRpcRes, error: rpcErr }, { data: clickProgress }] =
        await Promise.all([
          supabase.rpc("record_ad_seen", {
            p_ad_id: adId,
            p_user_email: cleanEmail,
          }),
          supabase.rpc("increment_user_click_progress", {
            p_email: cleanEmail,
            p_count: 1,
          }),
        ]);

      const seenFailed = Boolean(
        rpcErr ||
          seenRpcRes === false ||
          (typeof seenRpcRes === "object" &&
            seenRpcRes !== null &&
            (seenRpcRes as any).success === false)
      );

      if (seenFailed) {
        const [{ data: adRow }] = await Promise.all([
          supabase
            .from("addsactive")
            .select("impression_count, impressions")
            .eq("id", adId)
            .maybeSingle(),
          supabase
            .from("ad_impressions")
            .insert({ ad_id: adId, user_email: cleanEmail })
            .then(() => {}, () => {}),
        ]);
        if (adRow) {
          await supabase
            .from("addsactive")
            .update({
              impression_count: Number(adRow.impression_count || 0) + 1,
            })
            .eq("id", adId);
        }
      }

      let newCount =
        clickProgress &&
        clickProgress.length > 0 &&
        typeof clickProgress[0].new_click_count === "number"
          ? Number(clickProgress[0].new_click_count)
          : 0;
      let isMon = Boolean(
        clickProgress?.[0]?.is_now_monetized || newCount >= 300
      );

      if (!newCount) {
        const { data: uRow } = await supabase
          .from("users")
          .select("id, monetization_clicks, monetized")
          .ilike("email", cleanEmail)
          .maybeSingle();
        if (uRow) {
          newCount = Number(uRow.monetization_clicks || 0) + 1;
          isMon =
            uRow.monetized === true ||
            uRow.monetized === "true" ||
            uRow.monetized === "yes" ||
            newCount >= 300;
          await supabase
            .from("users")
            .update({
              monetization_clicks: newCount,
              ...(isMon ? { monetized: "true" } : {}),
            })
            .eq("id", uRow.id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          clicksCount: newCount || undefined,
          isMonetized: isMon,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 10. Rate Audience Listeners for Active/Completed Campaign
    if (action === "rate_listeners") {
      const adId = String(body?.ad_id || body?.adId || "").trim();
      const starRating = Number(body?.star_rating ?? body?.starRating ?? 5);
      if (!adId || starRating < 1 || starRating > 5) {
        return new Response(
          JSON.stringify({ error: "Valid campaign ID and rating (1-5) required." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: existing } = await supabase
        .from("completed_ads_ratings")
        .select("id, star_rating")
        .eq("ad_id", adId)
        .ilike("advertiser_email", cleanEmail)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({
            error: `You have already rated this campaign (${existing.star_rating} Stars).`,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const scoreIncrement = starRating * 0.2;
      await supabase.from("completed_ads_ratings").insert([
        {
          ad_id: adId,
          advertiser_email: cleanEmail,
          star_rating: starRating,
          score_increment: scoreIncrement,
          listeners_count: 0,
        },
      ]);

      try {
        await supabase.rpc("apply_ad_rating_to_listeners", {
          p_ad_id: adId,
          p_advertiser_email: cleanEmail,
          p_star_rating: starRating,
        });
      } catch {}

      return new Response(
        JSON.stringify({
          success: true,
          message: "Thank you for rating! Audience Attention Scores updated.",
          star_rating: starRating,
          score_increment: scoreIncrement,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 11. Report Ad or Advertiser
    if (action === "report_ad") {
      const { adId, advertiserEmail, reportType, reason } = body;
      await supabase.from("ad_reports").insert([
        {
          ad_id: adId,
          advertiser_email: advertiserEmail,
          reporter_email: cleanEmail,
          report_type: reportType || "ad",
          reason: reason || "Reported via mobile app",
        },
      ]);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 12. Business Domain Subscription (Status / Submit)
    if (action === "business_subscribe_status") {
      const { data } = await supabase
        .from("business_subscribers")
        .select("*")
        .ilike("user_email", cleanEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({ subscriber: data || null }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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
        return new Response(
          JSON.stringify({
            error: "Unable to submit business registration right now.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, subscriber: data }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unsupported campaign action." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Unable to process campaign request right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

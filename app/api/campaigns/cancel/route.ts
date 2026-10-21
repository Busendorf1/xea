import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await request.json();
    const adIdInput = body.adId || body.id;
    if (!adIdInput) {
      return NextResponse.json({ error: "Missing adId" }, { status: 400 });
    }

    const adId = String(adIdInput).replace(/^["']|["']$/g, "").trim();

    // 1. Check in 'adds' master queue (review / draft / pending publish)
    const { data: draftAd } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (draftAd) {
      if (draftAd.user_email?.toLowerCase() !== emailLower) {
        return NextResponse.json({ error: "Forbidden: You do not own this campaign" }, { status: 403 });
      }

      // Purge storage media if any
      if (draftAd.ad_media) {
        await purgeStorageMedia(draftAd.ad_media, "adds").catch(() => {});
      }

      // Permanently remove the draft from adds
      const { error: deleteErr } = await supabaseAdmin
        .from("adds")
        .delete()
        .eq("id", adId);

      if (deleteErr) {
        console.error("Error deleting campaign from adds:", deleteErr);
        return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
      }

      const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
      await invalidateCachedUserCampaigns(emailLower);

      return NextResponse.json({ success: true, message: "Campaign draft deleted successfully." });
    }

    // 2. Check in 'addsactive' table (live running campaign)
    const { data: activeAd } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (activeAd) {
      if (activeAd.user_email?.toLowerCase() !== emailLower) {
        return NextResponse.json({ error: "Forbidden: You do not own this campaign" }, { status: 403 });
      }

      const nowTimestamp = new Date().toISOString();

      // Archive to completed_ads
      try {
        await supabaseAdmin.from("completed_ads").insert([{
          ...activeAd,
          completed_at: nowTimestamp,
        }]);
      } catch {}

      // Delete from active delivery
      await supabaseAdmin.from("addsactive").delete().eq("id", adId);

      const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
      await invalidateCachedUserCampaigns(emailLower);

      return NextResponse.json({ success: true, message: "Campaign stopped successfully." });
    }

    // 3. Check in 'completed_ads' table
    const { data: completedAd } = await supabaseAdmin
      .from("completed_ads")
      .select("id, user_email")
      .eq("id", adId)
      .maybeSingle();

    if (completedAd) {
      if (completedAd.user_email?.toLowerCase() === emailLower) {
        await supabaseAdmin.from("completed_ads").delete().eq("id", adId);
        return NextResponse.json({ success: true, message: "Campaign removed." });
      }
    }

    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  } catch (err: any) {
    console.error("Unexpected error in POST /api/campaigns/cancel:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

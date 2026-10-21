import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });
    }

    // 1. Try finding in 'news' table
    const { data: item } = await supabaseAdmin
      .from("news")
      .select("id, image_url, user_email")
      .eq("id", id)
      .maybeSingle();

    if (item) {
      if (item.user_email?.toLowerCase() !== emailLower) {
        return NextResponse.json({ error: "Forbidden: You do not own this highlight" }, { status: 403 });
      }

      if (item.image_url) {
        await purgeStorageMedia(item.image_url, "news").catch(() => {});
      }

      await supabaseAdmin.from("news").delete().eq("id", id);
      await invalidateCachedUserCampaigns(emailLower);

      return NextResponse.json({ success: true, message: "Highlight deleted successfully" });
    }

    // 2. Fallback to 'newsactive' table
    const { data: activeItem } = await supabaseAdmin
      .from("newsactive")
      .select("id, image_url, user_email")
      .eq("id", id)
      .maybeSingle();

    if (activeItem) {
      if (activeItem.user_email?.toLowerCase() !== emailLower) {
        return NextResponse.json({ error: "Forbidden: You do not own this highlight" }, { status: 403 });
      }

      if (activeItem.image_url) {
        await purgeStorageMedia(activeItem.image_url, "news").catch(() => {});
      }

      await supabaseAdmin.from("newsactive").delete().eq("id", id);
      await invalidateCachedUserCampaigns(emailLower);

      return NextResponse.json({ success: true, message: "Highlight removed successfully" });
    }

    return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady, scanDeletePattern } from "@/lib/redis";

function isAdminPauseStatement(stmt?: string | null): boolean {
  if (!stmt || typeof stmt !== "string") return false;
  const trimmed = stmt.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper.startsWith("APPROVED:") ||
    upper.startsWith("REJECTED:") ||
    upper.startsWith("STATUS:") ||
    trimmed === "pending_review"
  ) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { highlightId, isPaused } = await req.json();
    if (!highlightId || typeof isPaused !== "boolean") {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const isAdmin = isAdminEmail(emailLower);

    // Check active table first, then review queue table
    let { data: highlight } = await supabaseAdmin
      .from("newsactive")
      .select("id, user_email, admin_statement")
      .eq("id", highlightId)
      .maybeSingle();

    if (!highlight) {
      const { data: pendingHighlight } = await supabaseAdmin
        .from("news")
        .select("id, user_email, admin_statement")
        .eq("id", highlightId)
        .maybeSingle();
      highlight = pendingHighlight;
    }

    if (!highlight) {
      return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
    }

    if (!isAdmin && highlight.user_email?.toLowerCase().trim() !== emailLower) {
      return NextResponse.json({ error: "Access denied. You do not own this highlight." }, { status: 403 });
    }

    // Block regular advertiser from resuming a highlight paused by Admin with an actual admin pause statement
    if (!isPaused && !isAdmin && isAdminPauseStatement(highlight.admin_statement)) {
      return NextResponse.json({ error: "Highlight Paused, follow instruction provided" }, { status: 400 });
    }

    if (!isAdmin) {
      // Rate Limit Check: 5 pause/resume actions per 12 hours (43200 seconds) per advertiser
      const rateLimitKey = `ratelimit:pause_highlight:${emailLower}`;
      let currentPauseCount = 0;
      try {
        const cnt = await redisConnection.get(rateLimitKey);
        currentPauseCount = cnt ? parseInt(cnt, 10) : 0;
      } catch (e) {
        currentPauseCount = 0;
      }

      if (currentPauseCount >= 5) {
        return NextResponse.json(
          { error: "Limit reached, try again later." },
          { status: 429 }
        );
      }

      // Increment count & set 12-hour expiry (43200 seconds)
      try {
        await redisConnection.incr(rateLimitKey);
        if (currentPauseCount === 0) {
          await redisConnection.expire(rateLimitKey, 43200);
        }
      } catch (e) {}
    }

    const activeUpdatePayload: Record<string, any> = { is_paused: isPaused };
    const newsUpdatePayload: Record<string, any> = { is_paused: isPaused };
    if (!isPaused && isAdmin) {
      activeUpdatePayload.admin_statement = null;
      if (isAdminPauseStatement(highlight.admin_statement)) {
        newsUpdatePayload.admin_statement = null;
      }
    }

    // Update is_paused on news and newsactive tables
    const [newsUpdate, activeUpdate] = await Promise.all([
      supabaseAdmin
        .from("news")
        .update(newsUpdatePayload)
        .eq("id", highlightId),
      supabaseAdmin
        .from("newsactive")
        .update(activeUpdatePayload)
        .eq("id", highlightId),
    ]);

    if (newsUpdate.error && activeUpdate.error) {
      console.error("❌ Error updating is_paused for highlight:", newsUpdate.error || activeUpdate.error);
      return NextResponse.json({ error: newsUpdate.error?.message || activeUpdate.error?.message }, { status: 500 });
    }

    const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
    const ownerEmail = highlight.user_email?.toLowerCase().trim() || emailLower;
    await invalidateCachedUserCampaigns(ownerEmail);
    if (isRedisReady()) {
      scanDeletePattern("admin:campaigns:*").catch(() => {});
    }

    return NextResponse.json({
      success: true,
      highlightId,
      isPaused,
      message: isPaused ? "Highlight paused successfully." : "Highlight resumed successfully."
    });
  } catch (err: any) {
    console.error("❌ Error in /api/highlights/pause:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`🔍 Fetching campaigns list for: ${email}`);

    const emailLower = email.toLowerCase().trim();

    // Query all queues in parallel on read replica database using B-tree indexed lookups
    const [adsQueue, adsActiveReal, adsCompleted, highlightsQueue, highlightsActive] = await Promise.all([
      supabaseReadOnly.from("adds").select("*").eq("user_email", emailLower),
      supabaseReadOnly.from("addsactive").select("*").eq("user_email", emailLower),
      supabaseReadOnly.from("completed_ads").select("*").eq("user_email", emailLower),
      supabaseReadOnly.from("news").select("*").eq("user_email", emailLower),
      supabaseReadOnly.from("newsactive").select("*").eq("user_email", emailLower),
    ]);

    const combinedActive = [
      ...(adsActiveReal.data || []),
      ...(adsCompleted.data || [])
    ];

    return NextResponse.json({
      adsQueue: adsQueue.data || [],
      adsActive: combinedActive,
      highlightsQueue: highlightsQueue.data || [],
      highlightsActive: highlightsActive.data || [],
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/campaigns:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

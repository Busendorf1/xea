import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`🔍 Fetching campaigns list for: ${email}`);

    // Query all queues in parallel on read replica database
    const [adsQueue, adsActive, highlightsQueue, highlightsActive] = await Promise.all([
      supabaseReadOnly.from("adds").select("*").ilike("user_email", email),
      supabaseReadOnly.from("addsactive").select("*").ilike("user_email", email),
      supabaseReadOnly.from("news").select("*").ilike("user_email", email),
      supabaseReadOnly.from("newsactive").select("*").ilike("user_email", email),
    ]);

    return NextResponse.json({
      adsQueue: adsQueue.data || [],
      adsActive: adsActive.data || [],
      highlightsQueue: highlightsQueue.data || [],
      highlightsActive: highlightsActive.data || [],
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/campaigns:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

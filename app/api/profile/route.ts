import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, setCachedProfile } from "@/lib/utils/cache";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Attempt to fetch from Redis cache first
    let user = await getCachedProfile(email);
    if (user) {
      console.log(`🚀 Profile cache hit in /api/profile for: ${email}`);
      return NextResponse.json(user);
    }

    console.log(`🔄 Profile cache miss in /api/profile for: ${email}. Fetching from Supabase...`);

    // Fetch user profile from Supabase with retries (resilience to flaky hotspot networks)
    let error = null;
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        const { data, error: dbErr } = await supabaseReadOnly
          .from("users")
          .select("*")
          .ilike("email", email)
          .maybeSingle();

        if (dbErr) {
          error = dbErr;
          console.warn(`⚠️ Supabase fetch attempt ${i + 1} failed:`, dbErr.message);
        } else {
          user = data;
          error = null;
          break;
        }
      } catch (err: any) {
        error = err;
        console.warn(`⚠️ Supabase fetch attempt ${i + 1} encountered exception:`, err.message || err);
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1000)); // wait 1s before retrying
      }
    }

    if (error) {
      console.error("❌ Error fetching user profile after all attempts:", error);
      return NextResponse.json({ error: error.message || "Database connection failure" }, { status: 500 });
    }

    // Auto-provision if user does not exist in DB (secure signup flow)
    if (!user) {
      console.log(`👤 User not found in database. Auto-provisioning profile for: ${email}`);
      const dummyPhone = `PLACEHOLDER_PHONE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const dummyPassphrase = `PLACEHOLDER_PASS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const { error: insertError } = await supabaseAdmin.rpc("auto_provision_user", {
        p_email: email,
        p_first_name: email.split("@")[0],
        p_last_name: "User",
        p_profile_image: "",
        p_business_name: "",
        p_phone: dummyPhone,
        p_passphrase: dummyPassphrase
      });

      if (insertError) {
        console.error("❌ Auto-provisioning failed:", insertError);
        return NextResponse.json({ error: "Failed to setup profile" }, { status: 500 });
      }

      // Fetch the newly created profile
      const { data: newUser, error: fetchError } = await supabaseAdmin
        .from("users")
        .select("*")
        .ilike("email", email)
        .maybeSingle();

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      user = newUser;
    }

    if (user) {
      await setCachedProfile(email, user);
    }

    return NextResponse.json(user);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/profile:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user profile from Supabase
    let { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      console.error("❌ Error fetching user profile:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json(user);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/profile:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

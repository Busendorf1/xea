import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { auth0 } from "@/lib/auth0";

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const data = await req.json();

    // Check phone uniqueness if phone is provided in update
    const phone = data.phone;
    if (phone) {
      const { data: phoneCheck, error: phoneErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("phone", phone)
        .neq("email", email)
        .maybeSingle();

      if (phoneErr) {
        console.error("❌ Phone check error:", phoneErr);
      }

      if (phoneCheck) {
        return NextResponse.json({ error: "This phone number is already in use by another user." }, { status: 400 });
      }
    }

    // Build the update payload dynamically
    const allowedFields = [
      "username", "dob", "country", "state", "location", "phone", "passphrase",
      "industry", "interest", "behavior", "lifestyle", "personality",
      "intl_travel", "local_travel", "profileImage", "bio", "gender", "employment",
      "business_name", "has_updated_profile"
    ];

    const updateData: any = {
      lastUpdated: new Date().toISOString()
    };

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        if (field === "intl_travel") {
          updateData.intl_travel = data.intl_travel === true || data.intl_travel === "yes";
        } else if (field === "local_travel") {
          updateData.local_travel = data.local_travel === true || data.local_travel === "yes";
        } else {
          updateData[field] = data[field];
        }
      }
    });

    // Support camelCase payloads from profile-setup component
    if (data.intlTravel !== undefined) {
      updateData.intl_travel = data.intlTravel === true || data.intlTravel === "yes";
    }
    if (data.localTravel !== undefined) {
      updateData.local_travel = data.localTravel === true || data.localTravel === "yes";
    }
    if (data.businessName !== undefined) {
      updateData.business_name = data.businessName;
    }

    // Ensure dob, country, state, location, and phone are validated if they are being updated or set
    // (but only require them on initial setup, i.e. when they are not placeholders, or if they are in data)
    // Wait, on initial profile setup we validate dob, country, state, location, phone in profile-setup component.
    // So we don't need strict validation on all updates unless they are provided.

    const { error } = await supabaseAdmin.rpc("update_user_profile", {
      p_email: email,
      p_username: updateData.username || null,
      p_dob: updateData.dob || null,
      p_country: updateData.country || null,
      p_state: updateData.state || null,
      p_location: updateData.location || null,
      p_phone: updateData.phone || null,
      p_passphrase: updateData.passphrase || null,
      p_industry: updateData.industry || null,
      p_interest: updateData.interest || null,
      p_behavior: updateData.behavior || null,
      p_lifestyle: updateData.lifestyle || null,
      p_personality: updateData.personality || null,
      p_gender: updateData.gender || null,
      p_employment: updateData.employment || null,
      p_intl_travel: updateData.intl_travel !== undefined ? updateData.intl_travel : null,
      p_local_travel: updateData.local_travel !== undefined ? updateData.local_travel : null,
      p_profile_image: updateData.profileImage || null,
      p_bio: updateData.bio || null,
      p_business_name: updateData.business_name || null,
      p_has_updated_profile: updateData.has_updated_profile !== undefined ? updateData.has_updated_profile : null
    });

    if (error) {
      console.error("Update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "User registered successfully" }, { status: 201 });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

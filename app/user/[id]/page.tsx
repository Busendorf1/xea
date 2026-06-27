import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import DashboardClient from "@/components/DashboardClient/page";

export default async function UserDashboard() {
  const session = await auth0.getSession();

  if (!session || !session.user) {
    redirect("/");
  }

  const email = session.user.email;

  if (!email) {
    return <div>Access Denied: No account associated with session.</div>;
  }

  // Fetch user profile from Supabase using admin client
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select(`
      id,
      "profileImage",
      username,
      "firstName",
      "lastName",
      "lastUpdated",
      bio,
      interest,
      email,
      industry,
      behavior,
      lifestyle,
      personality,
      monetized,
      monetized_at,
      created_at,
      monetized_until,
      monetization_type,
      country,
      state,
      location,
      phone,
      business_name,
      passphrase,
      mutual_count,
      balance,
      withdrawal,
      bvn_hash
    `)
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching user profile from database:", error);
    return <div>Error loading account profile: {error.message}. Please refresh or contact support.</div>;
  }

  // If user does not exist, auto-provision their account
  if (!user) {
    console.log(`👤 User not found in database. Auto-provisioning profile for: ${email}`);

    const givenName = session.user.given_name || session.user.name || "User";
    const familyName = session.user.family_name || "";
    const profileImage = session.user.picture || "";
    const business_name = session.user.business_name || "";

    // Generate unique placeholders for required UNIQUE & NOT NULL fields
    const dummyPhone = `PLACEHOLDER_PHONE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const dummyPassphrase = `PLACEHOLDER_PASS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const { error: insertError } = await supabaseAdmin.rpc("auto_provision_user", {
      p_email: email,
      p_first_name: givenName,
      p_last_name: familyName,
      p_profile_image: profileImage,
      p_business_name: business_name,
      p_phone: dummyPhone,
      p_passphrase: dummyPassphrase
    });

    if (insertError) {
      console.error("❌ Auto-provisioning failed:", insertError);
      return <div>Failed to set up account. Please contact support.</div>;
    }

    redirect("/user/profile-setup");
  }

  // If user is provisioned but hasn't completed setup, redirect to profile-setup
  if (user.country === "PLACEHOLDER" || user.state === "PLACEHOLDER" || user.location === "PLACEHOLDER") {
    redirect("/user/profile-setup");
  }

  const parsedInterest = Array.isArray(user.interest)
    ? user.interest
    : JSON.parse(user.interest || "[]");

  return (
    <DashboardClient 
      user={user as any} 
      parsedInterest={parsedInterest} 
      email={email} 
    />
  );
}

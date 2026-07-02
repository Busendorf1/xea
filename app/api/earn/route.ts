import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import crypto from "crypto";

const SECRET_KEY = process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type, turnstileToken } = body;

    if (!adId || !token || !servedAt || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // 1. Verify Cloudflare Turnstile CAPTCHA token (Disabled temporarily per user request)
    /*
    const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Security check token missing. Please try again." }, { status: 400 });
      }

      if (turnstileToken === "no-turnstile-script" && turnstileSecret === "1x00000000000000000000000000000000A") {
        console.log("⚠️ Skipping Turnstile check since script was blocked and test keys are active.");
      } else {
        const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        try {
          const verifyRes = await fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret: turnstileSecret,
              response: turnstileToken
            }).toString()
          });

          const verifyData = await verifyRes.json();
          if (!verifyData.success) {
            console.error("❌ Cloudflare Turnstile verification failed:", verifyData);
            return NextResponse.json({ error: "Security check failed. Please refresh and try again." }, { status: 400 });
          }
        } catch (verifyErr) {
          console.error("❌ Error contacting Cloudflare Turnstile API:", verifyErr);
          if (turnstileSecret !== "1x00000000000000000000000000000000A") {
            return NextResponse.json({ error: "Unable to verify security challenge. Please try again." }, { status: 400 });
          }
        }
      }
    }
    */

    const userId = session?.user?.sub || email;

    // 1. Verify PoV Token signature
    const payload = `${adId}:${userId}:${servedAt}`;
    const expectedToken = crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
    
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Invalid Proof-of-View token" }, { status: 400 });
    }

    const now = Date.now();
    const viewDuration = now - parseInt(servedAt, 10);

    // 2. Enforce 15-second minimum view duration
    if (viewDuration < 15000) {
      return NextResponse.json({ error: "View duration too short. Please watch the ad for at least 15 seconds." }, { status: 400 });
    }

    // 3. Enforce 30-minute maximum token age
    if (viewDuration > 1800000) {
      return NextResponse.json({ error: "Proof-of-View token has expired. Please refresh the feed." }, { status: 400 });
    }

    // 4. Execute database RPC securely via admin client
    if (type === "earn") {
      const { data: creditResult, error } = await supabaseAdmin.rpc("handle_earn_click", {
        p_ad_id: adId,
        p_user_email: email
      });

      if (error) {
        console.error("❌ RPC handle_earn_click error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, result: creditResult });
    } else {
      const { data: mutualResult, error } = await supabaseAdmin.rpc("handle_mutual_click", {
        p_ad_id: adId,
        p_user_email: email
      });

      if (error) {
        console.error("❌ RPC handle_mutual_click error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, result: mutualResult });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

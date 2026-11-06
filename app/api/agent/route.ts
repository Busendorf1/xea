import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import {
  getAgentNetworkData,
  registerUserAsAgent,
  bindUserToAgentByCode,
  handleAgentOptOut,
  checkAgencyStatusChangeRateLimit,
  recordAgencyStatusChange,
} from "@/lib/agentSystem";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const pendingRefCookie = req.cookies.get("paayh_ref_code")?.value?.trim();
    const queryRefCode = req.nextUrl.searchParams.get("bindRef")?.trim();
    const codeToBind = queryRefCode || pendingRefCookie;

    if (codeToBind) {
      const forwardedFor = req.headers.get("x-forwarded-for");
      const ipAddress = forwardedFor
        ? forwardedFor.split(",")[0].trim()
        : req.headers.get("x-real-ip") || "127.0.0.1";

      await bindUserToAgentByCode({
        refereeEmail: emailLower,
        referralCode: codeToBind,
        ipAddress,
      }).catch(() => {});
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "1" || Boolean(codeToBind);
    const networkData = await getAgentNetworkData(emailLower, fresh);
    const response = NextResponse.json({
      success: true,
      ...networkData,
    });

    if (pendingRefCookie) {
      response.cookies.set("paayh_ref_code", "", { path: "/", maxAge: 0 });
    }

    return response;
  } catch (err: any) {
    console.error("❌ Error in GET /api/agent:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load Agent network data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await req.json();
    const { action, referralCode, optOutAction, refereeEmail } = body || {};

    if (action === "register") {
      const rateCheck = await checkAgencyStatusChangeRateLimit(emailLower);
      if (!rateCheck.allowed) {
        return NextResponse.json({ error: rateCheck.cooldownMessage }, { status: 429 });
      }

      const regResult = await registerUserAsAgent(emailLower);
      if (regResult.success) {
        await recordAgencyStatusChange(emailLower);
      }
      if (!regResult.success) {
        return NextResponse.json(
          { error: regResult.error || "Failed to register as Agent" },
          { status: 400 }
        );
      }
      const networkData = await getAgentNetworkData(emailLower, true);
      return NextResponse.json({
        success: true,
        message: "You are now registered as a Paayh Agent!",
        ...networkData,
      });
    }

    if (action === "bind") {
      if (!referralCode) {
        return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
      }
      const forwardedFor = req.headers.get("x-forwarded-for");
      const ipAddress = forwardedFor
        ? forwardedFor.split(",")[0].trim()
        : req.headers.get("x-real-ip") || "127.0.0.1";

      const bindResult = await bindUserToAgentByCode({
        refereeEmail: emailLower,
        referralCode: String(referralCode),
        ipAddress,
      });

      if (!bindResult.success) {
        return NextResponse.json(
          { error: bindResult.error || "Could not bind referral code" },
          { status: 400 }
        );
      }

      const networkData = await getAgentNetworkData(emailLower, true);
      const response = NextResponse.json({
        success: true,
        message: "Referral code linked successfully!",
        ...networkData,
      });
      response.cookies.set("paayh_ref_code", "", { path: "/", maxAge: 0 });
      return response;
    }

    if (action === "opt_out") {
      const validActions = [
        "request",
        "cancel_request",
        "accept",
        "reject",
        "agent_request",
        "agent_cancel",
        "referee_accept",
        "referee_reject",
        "force",
      ];
      if (!optOutAction || !validActions.includes(optOutAction)) {
        return NextResponse.json({ error: "Invalid opt-out action" }, { status: 400 });
      }

      if (optOutAction === "force") {
        const rateCheck = await checkAgencyStatusChangeRateLimit(emailLower);
        if (!rateCheck.allowed) {
          return NextResponse.json({ error: rateCheck.cooldownMessage }, { status: 429 });
        }
      }

      const optOutResult = await handleAgentOptOut({
        actorEmail: emailLower,
        action: optOutAction,
        targetRefereeEmail: refereeEmail,
      });

      if (optOutResult.success && optOutAction === "force") {
        await recordAgencyStatusChange(emailLower);
      }

      if (!optOutResult.success) {
        return NextResponse.json(
          { error: optOutResult.error || "Opt-out action failed" },
          { status: 400 }
        );
      }

      const networkData = await getAgentNetworkData(emailLower, true);
      return NextResponse.json({
        success: true,
        message: optOutResult.message,
        ...networkData,
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error in POST /api/agent:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

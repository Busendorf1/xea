import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import {
  checkAdminVelocityLimit,
  requiresDualApproval,
  createPendingAdminRequest,
  recordAdminAuditTrail,
} from "@/lib/security/adminGuard";

// Helper to check if email is admin
async function isAdmin(email: string): Promise<boolean> {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
  if (adminEmails.includes(email.toLowerCase())) return true;

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role, is_admin")
    .ilike("email", email)
    .maybeSingle();

  return user?.role === "admin" || user?.is_admin === true;
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getAuthenticatedEmail(req);
    if (!adminEmail || !(await isAdmin(adminEmail))) {
      return NextResponse.json({ error: "Unauthorized: Administrator access required" }, { status: 403 });
    }

    const body = await req.json();
    const { reference, reason } = body;

    if (!reference || typeof reference !== "string" || reference.trim().length === 0) {
      return NextResponse.json({ error: "Transaction reference is required for reversal" }, { status: 400 });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return NextResponse.json(
        { error: "A detailed audit reason (at least 5 characters) is required for transfer reversals" },
        { status: 400 }
      );
    }

    const cleanRef = reference.trim();

    // 1. Fetch original transfer details
    const { data: originalTransfer, error: fetchErr } = await supabaseAdmin
      .from("payments")
      .select("id, reference, amount, user_email, status, type, metadata")
      .eq("reference", cleanRef)
      .eq("type", "transfer_sent")
      .eq("status", "success")
      .maybeSingle();

    if (fetchErr || !originalTransfer) {
      return NextResponse.json(
        { error: "Original successful transfer record not found for reference: " + cleanRef },
        { status: 404 }
      );
    }

    const amountNaira = parseFloat(originalTransfer.amount || "0");

    // 2. Compromised Admin Protection: Velocity & Blast Radius Cap Check
    const velocityCheck = await checkAdminVelocityLimit(adminEmail, amountNaira);
    if (!velocityCheck.allowed) {
      return NextResponse.json({ error: velocityCheck.reason }, { status: 403 });
    }

    // 3. Compromised Admin Protection: Dual-Authorization (Four-Eyes Principle) for > ₦50,000
    if (requiresDualApproval(amountNaira)) {
      const pendingReq = await createPendingAdminRequest({
        actionType: "transfer_reversal",
        requestedBy: adminEmail,
        targetIdentifier: cleanRef,
        amountNaira,
        payload: {
          reference: cleanRef,
          original_sender: originalTransfer.user_email,
          recipient_email: originalTransfer.metadata?.recipient_email,
          amount_naira: amountNaira,
        },
        reason,
      });

      return NextResponse.json({
        success: true,
        requiresDualApproval: true,
        requestId: pendingReq.id,
        message: `Reversal of ₦${amountNaira.toLocaleString("en-NG")} exceeds ₦50,000 threshold. Request created and awaiting approval by a second administrator.`,
      });
    }

    // 4. Atomic Execution of Reversal RPC (< ₦50,000 threshold)
    const { data: reversalResult, error: rpcErr } = await supabaseAdmin.rpc("reverse_user_transfer", {
      p_admin_email: adminEmail,
      p_reference: cleanRef,
      p_reason: reason,
    });

    if (rpcErr || !reversalResult?.success) {
      return NextResponse.json(
        { error: reversalResult?.error || rpcErr?.message || "Transfer reversal failed" },
        { status: 400 }
      );
    }

    // 5. Invalidate Redis Caches
    if (reversalResult.sender_email && reversalResult.recipient_email) {
      await Promise.all([
        invalidateCachedProfile(reversalResult.sender_email),
        invalidateCachedProfile(reversalResult.recipient_email),
      ]);
    }

    // 6. Record Audit Trail
    await recordAdminAuditTrail({
      adminEmail,
      action: "reverse_user_transfer",
      targetId: cleanRef,
      targetType: "transfer",
      reason,
      newState: reversalResult,
      req,
    });

    return NextResponse.json({
      success: true,
      requiresDualApproval: false,
      reversal: reversalResult,
      message: `Transfer of ₦${amountNaira.toLocaleString("en-NG")} [Ref: ${cleanRef}] successfully reversed and restored to sender.`,
    });
  } catch (err: any) {
    console.error("❌ POST /api/admin/transfers/reverse error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

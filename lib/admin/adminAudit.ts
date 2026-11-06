import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function recordAdminAudit(
  adminEmail: string,
  action: string,
  targetId?: string,
  targetType: string = "user",
  reason?: string | null,
  previousState?: any,
  newState?: any
) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: adminEmail.toLowerCase(),
      action,
      target_id: targetId || null,
      target_type: targetType,
      previous_state: previousState ? JSON.parse(JSON.stringify(previousState)) : null,
      new_state: newState ? JSON.parse(JSON.stringify(newState)) : null,
      reason: reason || null,
    }]);
  } catch {}
}

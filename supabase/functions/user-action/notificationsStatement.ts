import { jsonResponse } from "../_shared/cors.ts";

export async function handleGetNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const [{ data: userNotifs }, { data: announcements }, { data: readAnn }] =
    await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .ilike("user_email", cleanEmail)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("read_announcements")
        .select("announcement_id")
        .ilike("user_email", cleanEmail),
    ]);

  const readSet = new Set(
    (readAnn || []).map((r: { announcement_id: string }) => String(r.announcement_id)),
  );

  const formattedAnnouncements = (announcements || []).map(
    (a: Record<string, unknown>) => ({
      id: `ann_${a.id}`,
      user_email: cleanEmail,
      title: a.title || "Platform Announcement",
      message: a.message || a.content || "",
      type: "announcement",
      is_read: readSet.has(String(a.id)),
      created_at: a.created_at,
    }),
  );

  const combined = [...(userNotifs || []), ...formattedAnnouncements].sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(String(b.created_at || 0)).getTime() -
      new Date(String(a.created_at || 0)).getTime(),
  );

  const seenIds = new Set<string>();
  const seenContentKeys = new Set<string>();
  const deduplicated: Record<string, unknown>[] = [];

  const emojiRe =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  for (const item of combined) {
    if (!item || !item.id) continue;
    const strId = String(item.id);
    if (seenIds.has(strId)) continue;
    seenIds.add(strId);

    const normTitle = String(item.title || "").replace(emojiRe, "").trim().toLowerCase();
    const normMsg = String(item.message || "").replace(emojiRe, "").trim().toLowerCase();
    const notifTime = item.created_at ? new Date(String(item.created_at)).getTime() : 0;
    const timeWindow = notifTime > 0 ? Math.floor(notifTime / (30 * 60 * 1000)) : 0;
    const contentKey = `${normTitle}:::${normMsg}:::${timeWindow}`;

    if (seenContentKeys.has(contentKey)) continue;
    seenContentKeys.add(contentKey);
    deduplicated.push(item);
  }

  return jsonResponse(deduplicated);
}

export async function handleMarkNotificationsRead(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const notificationId = body?.notificationId;
  const all = Boolean(body?.all);

  if (all) {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .ilike("user_email", cleanEmail);
  } else if (notificationId) {
    if (String(notificationId).startsWith("ann_")) {
      const rawAnnId = String(notificationId).replace(/^ann_/, "");
      await supabase
        .from("read_announcements")
        .upsert(
          [{ user_email: cleanEmail, announcement_id: rawAnnId }],
          { onConflict: "user_email,announcement_id" },
        );
    } else {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .ilike("user_email", cleanEmail);
    }
  }

  return jsonResponse({ success: true });
}

export async function handleDeleteNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const notificationIds = body?.notificationIds;
  const all = Boolean(body?.all);

  if (all) {
    await supabase.from("notifications").delete().ilike("user_email", cleanEmail);
  } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    const regularIds = notificationIds.filter(
      (id: unknown) => !String(id).startsWith("ann_"),
    );
    if (regularIds.length > 0) {
      await supabase
        .from("notifications")
        .delete()
        .in("id", regularIds)
        .ilike("user_email", cleanEmail);
    }
  }

  return jsonResponse({ success: true });
}

export async function handleGetStatement(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const [{ data: paymentsRows }, { data: withdrawalRows }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, reference, amount, status, type, description, metadata, created_at")
      .ilike("user_email", cleanEmail)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("withdrawals")
      .select("id, reference, amount, fee, bank_name, account_number, account_name, status, created_at")
      .ilike("user_email", cleanEmail)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const safePayments = (paymentsRows || []).filter(
    (r: Record<string, unknown>) => r.type !== "withdrawal",
  );
  const safeWithdrawals =
    withdrawalRows && withdrawalRows.length > 0
      ? withdrawalRows.map((w: Record<string, unknown>) => ({
          ...w,
          type: "withdrawal",
          description:
            w.description ||
            `Withdrawal to ${w.bank_name || "Bank"} (${w.account_number || ""})`,
        }))
      : (paymentsRows || []).filter((r: Record<string, unknown>) => r.type === "withdrawal");

  const all = [...safePayments, ...safeWithdrawals].sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(String(b.created_at || 0)).getTime() -
      new Date(String(a.created_at || 0)).getTime(),
  );

  return jsonResponse({
    payments: safePayments,
    withdrawals: safeWithdrawals,
    all,
  });
}

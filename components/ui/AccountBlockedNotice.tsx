"use client";

import React from "react";
import NoticeModal from "@/components/MyAds/NoticeModal";
import type { AccountAccessStatus } from "@/lib/authHelper";

interface AccountBlockedNoticeProps {
  blocked: Pick<AccountAccessStatus, "blockType" | "blockedUntil" | "reason" | "message">;
}

export default function AccountBlockedNotice({ blocked }: AccountBlockedNoticeProps) {
  const isPermanent = blocked.blockType === "permanent";
  const title = isPermanent ? "Account Permanently Blocked" : "Account Temporarily Blocked";

  const fallbackMessage = isPermanent
    ? "Your account has been permanently blocked from accessing Paayh."
    : blocked.blockedUntil
    ? `Your account has been temporarily blocked until ${new Date(blocked.blockedUntil).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "short", day: "numeric" }
      )} and cannot access Paayh right now.`
    : "Your account has been temporarily blocked and cannot access Paayh right now.";

  const message = blocked.message || fallbackMessage;

  const handleSignOut = () => {
    window.location.href = "/auth/logout";
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "var(--background, #0a0a0a)",
      }}
    >
      <NoticeModal
        notice={{
          title,
          message,
          isDestructive: true,
        }}
        onClose={handleSignOut}
      />
    </main>
  );
}

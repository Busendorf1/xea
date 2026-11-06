"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";

interface InviteLinkProps {
  username: string;
  referralCode?: string | null;
}

export default function InviteLink({ username, referralCode }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const [resolvedCode, setResolvedCode] = useState<string>(referralCode || "");
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    if (referralCode) {
      setResolvedCode(referralCode);
    }
  }, [referralCode]);

  useEffect(() => {
    const handleAgentSync = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.referralCode) {
        setResolvedCode(custom.detail.referralCode);
      }
    };
    window.addEventListener("paayh:agent_network_loaded", handleAgentSync);
    return () => {
      window.removeEventListener("paayh:agent_network_loaded", handleAgentSync);
    };
  }, []);

  useEffect(() => {
    const cleanFallback = (username || "").split("@")[0];
    const codeParam = resolvedCode || cleanFallback;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://xea.app";
    setInviteUrl(`${origin}/join?ref=${encodeURIComponent(codeParam)}`);
  }, [username, resolvedCode]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  return (
    <div className={styles.inviteCard}>
      <h4 className={styles.inviteHeader}>Invite Friends</h4>
      <p className={styles.inviteText}>Share Paayh with your network and earn together.</p>
      <div className={styles.inviteLinkContainer}>
        <input
          type="text"
          readOnly
          value={inviteUrl}
          className={styles.inviteInput}
          onClick={handleCopy}
        />
        <button onClick={handleCopy} className={styles.copyBtn}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

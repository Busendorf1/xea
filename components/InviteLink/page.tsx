"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";

export default function InviteLink({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    // Safely retrieve location origin on the client side
    const cleanUsername = username.split("@")[0];
    const origin = typeof window !== "undefined" ? window.location.origin : "https://xea.app";
    setInviteUrl(`${origin}/join?ref=${cleanUsername}`);
  }, [username]);

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

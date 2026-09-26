"use client";

import { useEffect } from "react";
import supabase from "@/lib/utils/db";
import AppleSpinner from "@/components/ui/AppleSpinner";
import { motion } from "framer-motion";

export default function LogoutPage() {
  useEffect(() => {
    const logout = async () => {
      try {
        if (typeof window !== "undefined") {
          sessionStorage.clear();
          document.cookie = "paayh_active_tab=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
        await supabase.auth.signOut(); // Clear Supabase session
      } catch (err) {
        console.error("Supabase signOut error:", err);
      }
      setTimeout(() => {
        window.location.href = "/auth/logout";
      }, 500);
    };

    logout();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--background)",
        padding: "20px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          padding: "32px 36px",
          borderRadius: "var(--radius-card, 22px)",
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "var(--shadow-surface)",
          textAlign: "center",
          maxWidth: "380px",
          width: "100%",
        }}
      >
        <AppleSpinner size={36} color="var(--primary)" />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
            Signing out securely...
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
            Clearing local session and returning to sign in.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

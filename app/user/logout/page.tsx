"use client";

import { useEffect } from "react";
import supabase from "@/lib/utils/db";
import AppleSpinner from "@/components/ui/AppleSpinner";

export default function LogoutPage() {
  useEffect(() => {
    const logout = async () => {
      try {
        await supabase.auth.signOut(); // Clear Supabase session
      } catch (err) {
        console.error("Supabase signOut error:", err);
      }
      // Redirect to Auth0 logout endpoint immediately
      window.location.href = "/auth/logout";
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
      }}
    >
      <AppleSpinner size={42} />
    </div>
  );
}

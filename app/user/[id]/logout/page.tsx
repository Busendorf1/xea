"use client";

import { useEffect } from "react";
import supabase from "@/lib/utils/db";

export default function DynamicLogoutPage() {
  useEffect(() => {
    const logout = async () => {
      try {
        await supabase.auth.signOut(); // Clear Supabase session
      } catch (err) {
        console.error("Supabase signOut error:", err);
      }
      // Redirect to Auth0 logout endpoint handled by Auth0 middleware
      window.location.href = "/auth/logout";
    };

    logout();
  }, []);

  return <p>Logging out...</p>;
}

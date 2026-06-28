"use client";

import { useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import Footer from "../Footer/page";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type DeactivateAccountProps = {
  session: Session;
};

export default function DeactivateAccount({ session }: DeactivateAccountProps) {
  const router = useRouter();

  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = session?.user?.email;

  const handleDeleteAccount = async () => {
    if (!email) return;

    const confirmDelete = window.confirm(
      "WARNING: This will permanently delete your account and all associated data. Are you absolutely sure?"
    );
    if (!confirmDelete) return;

    setLoading(true);
    setError("");

    try {
      // 1. Fetch user's profile details to retrieve their passphrase behind the scenes
      const profileRes = await fetch("/api/profile");
      if (!profileRes.ok) {
        throw new Error("Failed to authenticate account for deactivation.");
      }
      const profileData = await profileRes.json();
      const currentPassphrase = profileData.passphrase || "";

      // 2. Call verify_and_deactivate_account with that passphrase
      const { data: success, error: rpcError } = await supabase.rpc(
        "verify_and_deactivate_account",
        { p_passphrase: currentPassphrase }
      );

      if (rpcError) {
        console.error("❌ RPC verify_and_deactivate_account error:", rpcError);
        setError(`Error deactivating account: ${rpcError.message}`);
        setLoading(false);
        return;
      }

      if (!success) {
        setError("Failed to verify account deactivation credentials.");
        setLoading(false);
        return;
      }

      setStep("done");
      // Redirect to Auth0 logout to clear session
      setTimeout(() => {
        window.location.href = "/auth/logout";
      }, 2000);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className={styles.container}>
      <h1 className={styles.title}>Deactivate Account</h1>

      {step === "confirm" && (
        <div className={styles.card}>
          <p>
            Are you sure you want to <strong>permanently delete</strong> your
            account?
            <br />
            This will also delete all your:
          </p>
          <ul className={styles.list}>
            <li>✅ Active Ads</li>
            <li>✅ Highlights in Review</li>
            <li>✅ Active Highlights</li>
            <li>✅ Monetization</li>
            <li>✅ User Data</li>
          </ul>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.buttons}>
            <button
              onClick={handleDeleteAccount}
              disabled={loading}
              className={styles.danger}
            >
              {loading ? "Deleting..." : "Yes, Delete My Account"}
            </button>
            <button
              onClick={() => router.push("/user/dashboard")}
              disabled={loading}
              className={styles.cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className={styles.card}>
          <h2>Account Deleted ✅</h2>
          <p>
            Your account, ads, and news have been permanently deleted.
            <br />
            We're sorry to see you go.
          </p>
        </div>
      )}
    </div>
    
      <Footer />
      </>
  );
}

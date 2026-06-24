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

  const [step, setStep] = useState<"confirm" | "passphrase" | "final" | "done">(
    "confirm"
  );
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = session?.user?.email;

  const handlePassphraseSubmit = async () => {
    if (!passphrase.trim()) {
      setError("Passphrase cannot be empty.");
      return;
    }
    setStep("final");
  };

  const handleDeleteAccount = async () => {
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      const { data: success, error: rpcError } = await supabase.rpc(
        "verify_and_deactivate_account",
        { p_passphrase: passphrase.trim() }
      );

      if (rpcError) {
        console.error("❌ RPC verify_and_deactivate_account error:", rpcError);
        setError(`Error verifying or deactivating: ${rpcError.message}`);
        setLoading(false);
        return;
      }

      if (!success) {
        setError("Incorrect passphrase. Please try again.");
        setStep("passphrase"); // send back to passphrase input
        setLoading(false);
        return;
      }

      setStep("done");
      // Redirect to Auth0 logout to clear session
      setTimeout(() => {
        window.location.href = "/auth/logout";
      }, 2000);
    } catch (err) {
      setError("Unexpected error occurred.");
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
          <div className={styles.buttons}>
            <button
              onClick={() => setStep("passphrase")}
              className={styles.danger}
            >
              Yes, Continue
            </button>
            <button
              onClick={() => router.push("/user/dashboard")}
              className={styles.cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "passphrase" && (
        <div className={styles.card}>
          <p>To confirm, enter your account passphrase:</p>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter passphrase"
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.buttons}>
            <button onClick={handlePassphraseSubmit} disabled={loading}>
              {loading ? "Checking..." : "Verify"}
            </button>
            <button
              onClick={() => setStep("confirm")}
              className={styles.cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "final" && (
        <div className={styles.card}>
          <p>
            ✅ Passphrase confirmed.
            <br />
            This will <strong>permanently delete</strong> your account and all
            data.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.buttons}>
            <button
              onClick={handleDeleteAccount}
              disabled={loading}
              className={styles.danger}
            >
              {loading ? "Deleting..." : "Delete My Account"}
            </button>
            <button
              onClick={() => setStep("confirm")}
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

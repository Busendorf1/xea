"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";
import { profileSetupStep1Schema } from "@/lib/validationSchemas";
import { AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FormStepProgress from "@/components/ui/FormStepProgress";
import FairAttentionModal from "@/components/ui/FairAttentionModal";
import { FormSkeleton } from "@/components/ui/PageSkeletons";
import ProfileSetupStep1 from "./_components/ProfileSetupStep1";
import ProfileSetupStep2 from "./_components/ProfileSetupStep2";
import { DropdownKey, OpenDropdownsState, ProfileFormData } from "./_components/types";

export default function ProfileSetup() {
  const { user: authUser, isLoading: authLoading } = useUser();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [goodwillAgreed, setGoodwillAgreed] = useState<boolean>(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  const [formData, setFormData] = useState<ProfileFormData>({
    username: "",
    dob: "",
    phone: "",
    country: "",
    state: "",
    location: "",
    bio: "",
    gender: "",
    employment: "",
    intlTravel: "no",
    localTravel: "no",
    industry: [] as string[],
    interest: [] as string[],
    behavior: [] as string[],
    lifestyle: [] as string[],
    personality: [] as string[],
    businessName: "",
  });

  const [openDropdowns, setOpenDropdowns] = useState<OpenDropdownsState>({
    industry: false,
    interest: false,
    behavior: false,
    lifestyle: false,
    personality: false,
  });

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<string | null>(null);

  // Restore saved draft state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("paayh_draft_profile_setup_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) {
          setFormData((prev) => ({ ...prev, ...parsed.formData }));
        }
        if (parsed.step && (parsed.step === 1 || parsed.step === 2)) {
          setStep(parsed.step);
        }
      }
    } catch {}
  }, []);

  // Autosave draft on changes (debounced 400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          "paayh_draft_profile_setup_v1",
          JSON.stringify({ step, formData })
        );
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [step, formData]);

  useEffect(() => {
    // Pre-fill username default from auth user if empty
    if (authUser && !formData.username) {
      const defaultUsername = authUser.nickname || authUser.email?.split("@")[0] || "";
      const cleanDefault = defaultUsername.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (cleanDefault.length >= 3) {
        setFormData((prev) => ({ ...prev, username: cleanDefault }));
      }
    }
  }, [authUser]);

  // Debounced real-time username availability check (100M+ scale fast lookup)
  useEffect(() => {
    const rawUsername = formData.username || "";
    const clean = rawUsername.trim().toLowerCase().replace(/^@/, "");

    if (!clean || clean.length < 3) {
      setUsernameAvailable(null);
      setUsernameStatus(null);
      return;
    }

    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const emailParam = authUser?.email ? `&email=${encodeURIComponent(authUser.email)}` : "";
        const res = await fetch(
          `/api/profile/check-username?username=${encodeURIComponent(clean)}${emailParam}`
        );
        const data = await res.json();
        setUsernameAvailable(data.available);
        setUsernameStatus(data.message);
      } catch {
        setUsernameAvailable(null);
        setUsernameStatus(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.username, authUser?.email]);

  useEffect(() => {
    // If not logged in after auth finishes loading, redirect to home
    if (!authLoading && !authUser) {
      router.push("/");
      return;
    }

    // Verify if user is already onboarded in the database to prevent duplicate onboarding
    if (!authLoading && authUser) {
      let isMounted = true;
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          const isAlreadyOnboarded =
            data &&
            !data.error &&
            (Boolean(data.has_updated_profile) ||
              (data.country &&
                data.country !== "PLACEHOLDER" &&
                data.state &&
                data.state !== "PLACEHOLDER" &&
                data.location &&
                data.location !== "PLACEHOLDER"));

          if (isAlreadyOnboarded) {
            console.log("✅ User already onboarded in database. Bypassing profile setup.");
            try {
              localStorage.removeItem("paayh_draft_profile_setup_v1");
            } catch {}
            router.replace("/logged-in?view=feed");
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [authUser, authLoading, router]);

  const toggleDropdown = (key: DropdownKey) => {
    setOpenDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: string, value: string, checked: boolean) => {
    setFormData((prev) => {
      const arr = Array.isArray(prev[name]) ? (prev[name] as string[]) : [];
      const updated = checked ? [...arr, value] : arr.filter((v) => v !== value);
      return { ...prev, [name]: updated };
    });
  };

  const validateStep1 = () => {
    setFieldErrors({});

    if (usernameAvailable === false) {
      const msg = "This username is already taken. Please choose another unique username.";
      setErrorMessage(msg);
      setFieldErrors({ username: "Already taken" });
      return false;
    }

    const result = profileSetupStep1Schema.safeParse(formData);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        if (!errs[key]) errs[key] = issue.message;
      });
      setFieldErrors(errs);
      setErrorMessage(result.error.issues[0]?.message ?? "Please fix the errors below.");
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If submitted on Step 1 (e.g. by pressing Enter in an input field), validate Step 1 and move to Step 2
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
        setErrorMessage(null);
        setFieldErrors({});
      }
      return;
    }

    // On Step 2 (Final submission):
    if (!validateStep1()) {
      setStep(1);
      return;
    }

    if (!goodwillAgreed) {
      const msg =
        "Please read and review the terms and policies, and tick the box to accept before completing setup.";
      setErrorMessage(msg);
      setTermsError(msg);
      return;
    }

    if (!formData.interest || formData.interest.length === 0) {
      const msg = "Select at least one Interest so we can target relevant ads for you.";
      setErrorMessage(msg);
      setFieldErrors({ interest: "Select at least one interest" });
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          dob: formData.dob,
          phone: formData.phone,
          country: formData.country,
          state: formData.state,
          location: formData.location,
          bio: formData.bio,
          gender: formData.gender,
          employment: formData.employment,
          intlTravel: formData.intlTravel,
          localTravel: formData.localTravel,
          industry: formData.industry,
          interest: formData.interest,
          behavior: formData.behavior,
          lifestyle: formData.lifestyle,
          personality: formData.personality,
          businessName: formData.businessName,
          has_updated_profile: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        setErrorMessage(errData.error || "Failed to update profile.");
        setLoading(false);
        return;
      }

      // Success - Redirect to feed
      try {
        localStorage.removeItem("paayh_draft_profile_setup_v1");
      } catch {}
      router.push("/");
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleSelectAll = (name: string, options: string[]) => {
    setFormData((prev) => ({ ...prev, [name]: [...options] }));
  };

  const handleClearAll = (name: string) => {
    setFormData((prev) => ({ ...prev, [name]: [] }));
  };

  if (authLoading) {
    return <FormSkeleton />;
  }

  return (
    <>
      <FairAttentionModal onAccept={() => setGoodwillAgreed(true)} />
      <HeaderJoin />
      <main className={styles.container}>
        <div className={styles.glowBlob}></div>

        <div className={styles.setupCard}>
          <FormStepProgress
            steps={["Profile info", "Targeting traits"]}
            currentStep={step - 1}
            onStepClick={(idx) => {
              if (idx < step - 1) {
                setStep(1);
              }
            }}
          />

          <div className={styles.cardHeader}>
            <h2>Profile Setup</h2>
            <p>Set up your profile and preferences to start earning.</p>
          </div>

          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  x: [-6, 6, -4, 4, -2, 2, 0],
                }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={styles.errorAlert}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className={styles.form}>
            {step === 1 && (
              <ProfileSetupStep1
                formData={formData}
                setFormData={setFormData}
                fieldErrors={fieldErrors}
                setFieldErrors={setFieldErrors}
                checkingUsername={checkingUsername}
                usernameAvailable={usernameAvailable}
                usernameStatus={usernameStatus}
                goodwillAgreed={goodwillAgreed}
                setGoodwillAgreed={setGoodwillAgreed}
                termsError={termsError}
                setTermsError={setTermsError}
                setErrorMessage={setErrorMessage}
                handleInputChange={handleInputChange}
                onLogout={() => router.push("/user/logout")}
                onNext={() => {
                  if (validateStep1()) {
                    setStep(2);
                    setErrorMessage(null);
                    setFieldErrors({});
                  }
                }}
              />
            )}

            {step === 2 && (
              <ProfileSetupStep2
                formData={formData}
                setFormData={setFormData}
                openDropdowns={openDropdowns}
                toggleDropdown={toggleDropdown}
                handleCheckboxChange={handleCheckboxChange}
                handleSelectAll={handleSelectAll}
                handleClearAll={handleClearAll}
                loading={loading}
                onLogout={() => router.push("/user/logout")}
                onBack={() => {
                  setStep(1);
                  setErrorMessage(null);
                  setFieldErrors({});
                }}
              />
            )}
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}

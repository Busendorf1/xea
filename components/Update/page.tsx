"use client";

import React, { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import AppleSpinner from "@/components/ui/AppleSpinner";
import { CheckCircle2, AlertCircle, ShieldCheck, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FormStepProgress from "@/components/ui/FormStepProgress";
import FairAttentionModal from "@/components/ui/FairAttentionModal";
import ProofOfLocationModal from "@/components/ui/ProofOfLocationModal";
import { MANUAL_LOCATION_PENDING_KEY } from "@/lib/utils/locationHelper";
import { isAdminEmail } from "@/lib/adminHelper";

import UpdatePersonalStep from "./UpdatePersonalStep";
import UpdateDemographicsStep from "./UpdateDemographicsStep";
import UpdateTargetingStep from "./UpdateTargetingStep";
import UpdateReviewStep from "./UpdateReviewStep";

export {
  UpdatePersonalStep,
  UpdateDemographicsStep,
  UpdateTargetingStep,
  UpdateReviewStep,
};

interface Props {
  email: string;
}

export interface UserProfileData {
  id: string;
  email: string;
  username: string;
  dob: string;
  country: string;
  state: string;
  location: string;
  industry: string[];
  interest: string[];
  behavior: string[];
  lifestyle: string[];
  personality: string[];
  gender: string;
  employment: string;
  phone: string;
  intlTravel: string;
  localTravel: string;
  firstName: string;
  lastName: string;
  bio: string;
  profileImage: string;
  lastUpdated: string;
  business_name?: string;
  has_updated_profile?: boolean;
}

const steps = [
  "Personal",
  "Demographics",
  "Targeting",
  "Review and Submit",
];

const CooldownBanner = React.memo(function CooldownBanner({
  nextAvailableMs,
  onExpire,
}: {
  nextAvailableMs: number;
  onExpire: () => void;
}) {
  const [countdownText, setCountdownText] = useState("");

  useEffect(() => {
    const updateCountdown = () => {
      const diff = nextAvailableMs - Date.now();
      if (diff <= 0) {
        setCountdownText("");
        onExpire();
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownText(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextAvailableMs, onExpire]);

  if (!countdownText) return null;

  return (
    <div className={styles.cooldownBanner}>
      <Clock size={16} className={styles.flexShrink0} />
      <span>Next update available in: </span>
      <span className={styles.cooldownCountdown}>{countdownText}</span>
    </div>
  );
});

export default function Update({ email }: Props) {
  const isAdmin = isAdminEmail(email);
  const [currentStep, setCurrentStep] = useState(0);
  const [dbProfile, setDbProfile] = useState<UserProfileData | null>(null);
  const [formData, setFormData] = useState<Partial<UserProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [openDropdowns, setOpenDropdowns] = useState({
    industry: false,
    interest: false,
    behavior: false,
    lifestyle: false,
    personality: false,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [nextAvailableMs, setNextAvailableMs] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [goodwillAgreed, setGoodwillAgreed] = useState<boolean>(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showProofOfLocationModal, setShowProofOfLocationModal] = useState<boolean>(false);
  const router = useRouter();

  const toggleDropdown = (key: keyof typeof openDropdowns) => {
    setOpenDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const validateStep = (stepIdx: number): boolean => {
    setStatus(null);
    if (!dbProfile) return false;

    if (stepIdx === 0) {
      // Step 0: Location and username
      const resolvedCountry = formData.country ? formData.country : dbProfile.country;
      const resolvedState = formData.state ? formData.state : dbProfile.state;
      const resolvedLocation = formData.location ? formData.location : dbProfile.location;
      if (!resolvedCountry || !resolvedState || !resolvedLocation) {
        setStatus("Location is required. Please use 'Auto-detect location' to set your country, state, and city.");
        return false;
      }
      return true;
    }

    if (stepIdx === 2) {
      // Step 2: Interests and Industries
      const resolvedInterest = Array.isArray(formData.interest) ? formData.interest : dbProfile.interest || [];
      const resolvedIndustry = Array.isArray(formData.industry) ? formData.industry : dbProfile.industry || [];

      if (!resolvedInterest || resolvedInterest.length === 0) {
        setStatus("At least one Interest must be selected so we can target relevant ads for you.");
        return false;
      }

      if (!resolvedIndustry || resolvedIndustry.length === 0) {
        setStatus("At least one Industry must be selected so we can target relevant ads for you.");
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      if (
        currentStep === 0 &&
        typeof window !== "undefined" &&
        localStorage.getItem(MANUAL_LOCATION_PENDING_KEY) === "true"
      ) {
        setShowProofOfLocationModal(true);
        return;
      }
      setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    setStatus(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) {
          setStatus("Failed to fetch profile.");
          setLoading(false);
          return;
        }
        const data = await res.json();

        // Ensure arrays for multi-selects
        const arrayFields = [
          "industry",
          "interest",
          "behavior",
          "lifestyle",
          "personality",
        ];
        arrayFields.forEach((field) => {
          if (typeof data[field] === "string") {
            data[field] = data[field]?.split(",").map((v: string) => v.trim());
          } else if (!Array.isArray(data[field])) {
            data[field] = [];
          }
        });

        setDbProfile(data);
        setFormData({
          industry: data.industry || [],
          interest: data.interest || [],
          behavior: data.behavior || [],
          lifestyle: data.lifestyle || [],
          personality: data.personality || [],
          gender: data.gender || "",
          employment: data.employment || "",
          intlTravel: data.intl_travel === true || data.intl_travel === "yes" ? "yes" : "no",
          localTravel: data.local_travel === true || data.local_travel === "yes" ? "yes" : "no",
          dob: data.dob || "",
        });
      } catch (e) {
        console.error("Error fetching profile:", e);
        setStatus("Failed to fetch profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [email]);

  useEffect(() => {
    if (isAdmin || !dbProfile || !dbProfile.has_updated_profile) {
      setTimeRemaining(null);
      setNextAvailableMs(null);
      return;
    }

    const lastUpdated = new Date(dbProfile.lastUpdated || 0);
    const targetMs = lastUpdated.getTime() + 30 * 24 * 60 * 60 * 1000;
    const diff = targetMs - Date.now();

    if (diff <= 0) {
      setTimeRemaining(null);
      setNextAvailableMs(null);
    } else {
      setTimeRemaining(diff);
      setNextAvailableMs(targetMs);
    }
  }, [dbProfile, isAdmin]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      const current = (formData as any)[name] || [];
      const updated = checked
        ? [...current, value]
        : current.filter((v: string) => v !== value);
      setFormData((prev) => ({ ...prev, [name]: updated }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleUpdate = async () => {
    if (!goodwillAgreed) {
      const msg = "Please read and review the terms and policies, and tick the box to accept before saving your profile.";
      setTermsError(msg);
      setStatus(msg);
      return;
    }
    if (!dbProfile) return;

    // Location is required, must be detected via GPS toggle
    const resolvedCountry = formData.country ? formData.country : dbProfile.country;
    const resolvedState = formData.state ? formData.state : dbProfile.state;
    const resolvedLocation = formData.location ? formData.location : dbProfile.location;
    if (!resolvedCountry || !resolvedState || !resolvedLocation) {
      setStatus("Location is required. Please enable 'Auto-detect location' to detect your country, state, and city via GPS.");
      return;
    }

    // Interest and Industry are required, cannot be left empty
    const resolvedInterest = Array.isArray(formData.interest) ? formData.interest : dbProfile.interest || [];
    const resolvedIndustry = Array.isArray(formData.industry) ? formData.industry : dbProfile.industry || [];

    if (!resolvedInterest || resolvedInterest.length === 0) {
      setStatus("At least one Interest must be selected so we can target relevant ads for you.");
      return;
    }

    if (!resolvedIndustry || resolvedIndustry.length === 0) {
      setStatus("At least one Industry must be selected so we can target relevant ads for you.");
      return;
    }

    if (!isAdmin && timeRemaining !== null && timeRemaining > 0) {
      setStatus("You can only update your profile once every 30 days.");
      return;
    }

    setLoading(true);
    setStatus("Checking update eligibility...");

    // 1. Fetch current timestamp & update status via secure API
    let latestUser;
    try {
      const resUser = await fetch("/api/profile");
      if (!resUser.ok) {
        throw new Error("Failed to fetch profile");
      }
      latestUser = await resUser.json();
    } catch (fetchErr: any) {
      console.error("Failed to check timestamp:", fetchErr.message);
      setStatus("Failed to verify update eligibility.");
      setLoading(false);
      return;
    }

    const now = new Date();
    if (!isAdmin && latestUser.has_updated_profile) {
      const lastUpdated = new Date(latestUser.lastUpdated || 0);
      const diffDays =
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays < 30) {
        console.warn(
          "Update blocked: Only",
          Math.floor(diffDays),
          "days passed"
        );
        setStatus("You can only update your profile once every 30 days.");
        setLoading(false);
        return;
      }
    }

    // 2. Upload new image if provided
    let imageUrl = dbProfile.profileImage;

    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}-${dbProfile.email}.${fileExt}`;
      const filePath = `public/${fileName}`;

      // Remove old image (optional)
      if (dbProfile.profileImage?.includes("storage.supabase")) {
        const parts = dbProfile.profileImage.split("/");
        const existingPath = `${parts.at(-2)}/${parts.at(-1)}`;
        await supabase.storage.from("dp").remove([existingPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("dp")
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("Image upload failed:", uploadError.message);
        setStatus("Failed to upload profile image.");
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("dp")
        .getPublicUrl(filePath);
      imageUrl = publicUrlData?.publicUrl || imageUrl;
    }

    // 3. Prepare payload, substituting placeholder values for empty form fields
    const payload = {
      ...dbProfile,
      ...formData,
      username: formData.username?.trim() ? formData.username.trim() : dbProfile.username,
      firstName: formData.firstName?.trim() ? formData.firstName.trim() : dbProfile.firstName,
      lastName: formData.lastName?.trim() ? formData.lastName.trim() : dbProfile.lastName,
      business_name: formData.business_name?.trim() ? formData.business_name.trim() : dbProfile.business_name,
      phone: formData.phone?.trim() ? formData.phone.trim() : dbProfile.phone,
      email: formData.email?.trim() ? formData.email.trim() : dbProfile.email,
      dob: formData.dob || dbProfile.dob,
      bio: formData.bio !== undefined ? formData.bio.trim() : dbProfile.bio,
      country: formData.country ? formData.country : dbProfile.country,
      state: formData.state ? formData.state : dbProfile.state,
      location: formData.location ? formData.location : dbProfile.location,
      profileImage: imageUrl,
      has_updated_profile: true,
    };

    // Remove passphrase if any in payload
    if ('passphrase' in payload) {
      delete (payload as any).passphrase;
    }

    // 4. Update Supabase via secure API
    try {
      const response = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Update rejected by API");
      }
    } catch (updateError: any) {
      console.error("Update failed:", updateError.message);
      setStatus(`Update failed: ${updateError.message}`);
      setLoading(false);
      return;
    }

    // 5. Reset state and show success
    setStatus("Successful.");
    setImageFile(null); // Reset image
    setLoading(false);

    // Optional delay for user to see the message
    setTimeout(() => {
      router.push("/");
    }, 1500);
  };

  const handleSelectAll = (name: "industry" | "interest" | "behavior" | "lifestyle" | "personality", options: string[]) => {
    setFormData((prev) => ({ ...prev, [name]: [...options] }));
  };

  const handleClearAll = (name: "industry" | "interest" | "behavior" | "lifestyle" | "personality") => {
    setFormData((prev) => ({ ...prev, [name]: [] }));
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <AppleSpinner size={42} />
      </div>
    );
  }
  if (!dbProfile) return <p>Profile not found.</p>;

  const isFormDisabled = !isAdmin && timeRemaining !== null && timeRemaining > 0;

  return (
    <div className={styles.profileContainer}>
      <FairAttentionModal onAccept={() => setGoodwillAgreed(true)} />
      {/* Step Progress Bar Header (Standardized to /news) */}
      <FormStepProgress
        steps={steps}
        currentStep={currentStep}
        onStepClick={(idx) => setCurrentStep(idx)}
      />

      <h1 className={styles.update}>Update Profile</h1>
      
      {isAdmin && (
        <div className={styles.adminPrivilegeBanner}>
          <ShieldCheck size={15} className={styles.flexShrink0} />
          <span>Admin Privilege: Unlimited profile updates (30-day cooldown bypassed)</span>
        </div>
      )}

      {isFormDisabled && nextAvailableMs && (
        <CooldownBanner
          nextAvailableMs={nextAvailableMs}
          onExpire={() => {
            setTimeRemaining(null);
            setNextAvailableMs(null);
          }}
        />
      )}

      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              x: status.includes("Failed") || status.includes("required") || status.includes("blocked") ? [-6, 6, -4, 4, -2, 2, 0] : 0 
            }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={`${styles.statusBanner} ${
              status.includes("Successful")
                ? styles.statusBannerSuccess
                : status.includes("Failed") || status.includes("required") || status.includes("blocked") || status.includes("only update")
                ? styles.statusBannerError
                : styles.statusBannerInfo
            }`}
          >
            {status.includes("Successful") ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : (
              <AlertCircle size={18} color={status.includes("Failed") ? "#ef4444" : "var(--primary)"} />
            )}
            <span>{status}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STEP 0: Personal & Location Details */}
      {currentStep === 0 && (
        <UpdatePersonalStep
          dbProfile={dbProfile}
          formData={formData}
          handleChange={handleChange}
          setFormData={setFormData}
          isFormDisabled={isFormDisabled}
        />
      )}

      {/* STEP 1: Demographics & Lifestyle */}
      {currentStep === 1 && (
        <UpdateDemographicsStep
          dbProfile={dbProfile}
          formData={formData}
          setFormData={setFormData}
          isFormDisabled={isFormDisabled}
          imageFile={imageFile}
          setImageFile={setImageFile}
        />
      )}

      {/* STEP 2: Categories, Interests & Bio */}
      {currentStep === 2 && (
        <UpdateTargetingStep
          dbProfile={dbProfile}
          formData={formData}
          handleChange={handleChange}
          openDropdowns={openDropdowns}
          toggleDropdown={toggleDropdown}
          handleSelectAll={handleSelectAll}
          handleClearAll={handleClearAll}
          isFormDisabled={isFormDisabled}
          timeRemaining={timeRemaining}
        />
      )}

      {/* STEP 3: Review & Submit */}
      {currentStep === 3 && (
        <UpdateReviewStep
          dbProfile={dbProfile}
          formData={formData}
          imageFile={imageFile}
          goodwillAgreed={goodwillAgreed}
          setGoodwillAgreed={setGoodwillAgreed}
          termsError={termsError}
          setTermsError={setTermsError}
          setStatus={setStatus}
        />
      )}

      {/* Step Navigation Controls */}
      <div className={styles.stepNavigationRow}>
        {currentStep > 0 && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            type="button"
            className={styles.prevBtn}
            onClick={handlePrevStep}
            disabled={loading}
          >
            Previous Step
          </motion.button>
        )}

        {currentStep < steps.length - 1 ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            type="button"
            className={styles.nextBtn}
            onClick={handleNextStep}
            disabled={isFormDisabled}
          >
            Continue to {steps[currentStep + 1]}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            type="button"
            className={`${styles.nextBtn} ${isFormDisabled ? styles.submitBtnDisabled : styles.submitBtnActive}`}
            onClick={handleUpdate}
            disabled={loading || isFormDisabled}
          >
            {loading ? (
              <span className={styles.savingSpinnerWrap}>
                <span className="btnSpinner" aria-hidden="true" />
                <span>Saving Profile...</span>
              </span>
            ) : isFormDisabled ? `Locked (Cooldown)` : "Save Profile"}
          </motion.button>
        )}
      </div>

      <ProofOfLocationModal
        email={email || dbProfile?.email}
        user={{
          country: formData.country || dbProfile?.country,
          state: formData.state || dbProfile?.state,
          location: formData.location || dbProfile?.location,
        }}
        autoCheck={false}
        forceOpen={showProofOfLocationModal}
        onVerified={(verifiedLoc) => {
          setFormData((prev) => ({
            ...prev,
            country: verifiedLoc.country,
            state: verifiedLoc.state,
            location: verifiedLoc.location,
          }));
          setShowProofOfLocationModal(false);
          setCurrentStep(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}

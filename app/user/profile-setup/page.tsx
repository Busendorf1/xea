"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";
import LocationSelector from "@/components/LocationSelector";
import { profileSetupStep1Schema } from "@/lib/validationSchemas";


import {
  ALL_INDUSTRIES as industries,
  ALL_INTERESTS as interests,
  ALL_BEHAVIORS as behaviors,
  ALL_LIFESTYLES as lifestyles,
  ALL_PERSONALITY_TRAITS as personalityTraits,
} from "@/lib/categoryTargetingMap";


export default function ProfileSetup() {
  const { user: authUser, isLoading: authLoading } = useUser();
  const router = useRouter();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
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

  const [openDropdowns, setOpenDropdowns] = useState({
    industry: false,
    interest: false,
    behavior: false,
    lifestyle: false,
    personality: false,
  });

  useEffect(() => {
    // If not logged in after auth finishes loading, redirect to home
    if (!authLoading && !authUser) {
      router.push("/");
    }
  }, [authUser, authLoading, router]);


  const toggleDropdown = (key: keyof typeof openDropdowns) => {
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: string, value: string, checked: boolean) => {
    setFormData(prev => {
      const arr = (prev as any)[name] as string[];
      const updated = checked ? [...arr, value] : arr.filter(v => v !== value);
      return { ...prev, [name]: updated };
    });
  };

  const validateStep1 = () => {
    setFieldErrors({});

    // Location is required — GPS toggle must be enabled and detected
    if (!formData.country || !formData.state || !formData.location) {
      const msg = "Location is required. Please enable 'Auto-detect location' to detect your country, state, and city via GPS.";
      setErrorMessage(msg);
      setFieldErrors({ country: "Required", state: "Required", location: "Required" });
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
    if (!validateStep1()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
          businessName: formData.businessName
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        setErrorMessage(errData.error || "Failed to update profile.");
        setLoading(false);
        return;
      }

      // Success - Redirect to dashboard
      router.push("/user/dashboard");
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const renderMultiSelect = (label: string, name: keyof typeof openDropdowns, options: string[]) => (
    <div className={styles.dropdownContainer}>
      <label className={styles.inputLabel}>{label}</label>
      <div className={styles.dropdownHeader} onClick={() => toggleDropdown(name)}>
        <span>{(formData as any)[name].length > 0 ? `${(formData as any)[name].length} selected` : `Select ${label}`}</span>
        <span>{openDropdowns[name] ? "▲" : "▼"}</span>
      </div>
      {openDropdowns[name] && (
        <div className={styles.checkboxGroup}>
          {options.map((opt, i) => (
            <label key={i} className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={(formData as any)[name].includes(opt)}
                onChange={(e) => handleCheckboxChange(name, opt, e.target.checked)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  if (authLoading) {
    return (
      <div className={styles.loadingContainer}>
        <p>Loading session...</p>
      </div>
    );
  }

  return (
    <>
      <HeaderJoin />
      <main className={styles.container}>
        <div className={styles.glowBlob}></div>
        
        <div className={styles.setupCard}>
          <div className={styles.progressContainer}>
            <div className={`${styles.progressStep} ${step >= 1 ? styles.stepActive : ""}`}>
              <div className={styles.stepNum}>1</div>
              <span>Profile info</span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: step === 2 ? "100%" : "0%" }}></div>
            </div>
            <div className={`${styles.progressStep} ${step >= 2 ? styles.stepActive : ""}`}>
              <div className={styles.stepNum}>2</div>
              <span>Targeting traits</span>
            </div>
          </div>

          <div className={styles.cardHeader}>
            <h2>Complete Profile Setup</h2>
            <p>Help us customize your dashboard so you only see ads that pay well and fit your preferences.</p>
          </div>

          {errorMessage && <div className={styles.errorAlert}>{errorMessage}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            {step === 1 && (
              <div className={styles.formStep}>
                <div className={styles.grid}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="dob" className={styles.inputLabel}>Date of Birth</label>
                    <input
                      type="date"
                      id="dob"
                      name="dob"
                      required
                      value={formData.dob}
                      onChange={handleInputChange}
                      className={styles.inputField}
                    />
                    {fieldErrors.dob && <span className={styles.fieldError}>{fieldErrors.dob}</span>}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="phone" className={styles.inputLabel}>Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      placeholder="e.g. +2348012345678"
                      required
                      maxLength={20}
                      value={formData.phone}
                      onChange={handleInputChange}
                      className={styles.inputField}
                    />
                    {fieldErrors.phone && <span className={styles.fieldError}>{fieldErrors.phone}</span>}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="gender" className={styles.inputLabel}>Gender</label>
                    <select
                      id="gender"
                      name="gender"
                      required
                      value={formData.gender}
                      onChange={handleInputChange}
                      className={styles.selectField}
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    {fieldErrors.gender && <span className={styles.fieldError}>{fieldErrors.gender}</span>}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="employment" className={styles.inputLabel}>Employment Status</label>
                    <select
                      id="employment"
                      name="employment"
                      required
                      value={formData.employment}
                      onChange={handleInputChange}
                      className={styles.selectField}
                    >
                      <option value="">Select Employment</option>
                      <option value="employed">Employed</option>
                      <option value="student">Student</option>
                      <option value="unemployed">Unemployed</option>
                      <option value="freelancer">Freelancer</option>
                      <option value="entrepreneur">Entrepreneur</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>

                  <LocationSelector
                    country={formData.country}
                    state={formData.state}
                    location={formData.location}
                    onChange={({ country, state, location }) =>
                      setFormData((prev) => ({ ...prev, country, state, location }))
                    }
                    inputClass={styles.inputField}
                    labelClass={styles.inputLabel}
                    groupClass={styles.inputGroup}
                    cityGroupClass={styles.inputGroupFull}
                    cityLabel="City/Location details"
                    gpsEnforced={true}
                  />

                  <div className={styles.inputGroupFull}>
                    <label htmlFor="businessName" className={styles.inputLabel}>Business Name (Optional, max 25 characters)</label>
                    <input
                      type="text"
                      id="businessName"
                      name="businessName"
                      placeholder="e.g. Acme Corp"
                      maxLength={25}
                      value={formData.businessName}
                      onChange={handleInputChange}
                      className={styles.inputField}
                    />
                  </div>

                  <div className={styles.inputGroupFull}>
                    <label htmlFor="bio" className={styles.inputLabel}>Bio (max 90 characters)</label>
                    <textarea
                      id="bio"
                      name="bio"
                      placeholder="Tell us a bit about yourself..."
                      maxLength={90}
                      value={formData.bio}
                      onChange={handleInputChange}
                      className={styles.textareaField}
                    />
                  </div>
                </div>

                <div className={styles.buttonGroup}>
                  <button
                    type="button"
                    onClick={() => router.push("/user/logout")}
                    className={styles.backBtn}
                    style={{ marginRight: "auto" }}
                  >
                    Logout
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep1()) setStep(2);
                    }}
                    className={styles.nextBtn}
                  >
                    Next Step
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className={styles.formStep}>
                <div className={styles.dropdownsGrid}>
                  {renderMultiSelect("Industries", "industry", industries)}
                  {renderMultiSelect("Interests", "interest", interests)}
                  {renderMultiSelect("Behaviors", "behavior", behaviors)}
                  {renderMultiSelect("Lifestyles", "lifestyle", lifestyles)}
                  {renderMultiSelect("Personality Traits", "personality", personalityTraits)}
                </div>

                <div className={styles.grid2}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="intlTravel" className={styles.inputLabel}>International Traveller?</label>
                    <select
                      id="intlTravel"
                      name="intlTravel"
                      value={formData.intlTravel}
                      onChange={handleInputChange}
                      className={styles.selectField}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  

                  <div className={styles.inputGroup}>
                    <label htmlFor="localTravel" className={styles.inputLabel}>Local Air Traveller?</label>
                    <select
                      id="localTravel"
                      name="localTravel"
                      value={formData.localTravel}
                      onChange={handleInputChange}
                      className={styles.selectField}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>

                <div className={styles.buttonGroup}>
                  <button
                    type="button"
                    onClick={() => router.push("/user/logout")}
                    className={styles.backBtn}
                    style={{ marginRight: "auto" }}
                    disabled={loading}
                  >
                    Logout
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={styles.backBtn}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={loading}
                  >
                    {loading ? "Completing setup..." : "Complete & Enter Dashboard"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}

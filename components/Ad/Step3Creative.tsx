"use client";

import React from "react";
import { AdFormSelections } from "./types";
import Step3MediaSection from "./Step3MediaSection";
import Step3OfferAndCopySection from "./Step3OfferAndCopySection";
import Step3ContactButtonsSection from "./Step3ContactButtonsSection";
import styles from "./page.module.css";

interface Step3CreativeProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
  adType: string;
  isAdmin: boolean;
}

export default function Step3Creative({
  formSelections,
  setFormSelections,
  adType,
  isAdmin,
}: Step3CreativeProps) {
  return (
    <>
      <Step3MediaSection
        formSelections={formSelections}
        setFormSelections={setFormSelections}
      />

      {/* Copy & Interactive Actions */}
      <div className={styles.adCreativeSection}>
        <Step3OfferAndCopySection
          formSelections={formSelections}
          setFormSelections={setFormSelections}
          adType={adType}
          isAdmin={isAdmin}
        />

        <Step3ContactButtonsSection
          formSelections={formSelections}
          setFormSelections={setFormSelections}
          adType={adType}
        />
      </div>
    </>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import styles from "./page.module.css";

interface PersonaDrawerProps {
  interest?: string[];
  industry?: string[];
  behavior?: string[];
  lifestyle?: string[];
  personality?: string[];
}

export default function PersonaDrawer({
  interest = [],
  industry = [],
  behavior = [],
  lifestyle = [],
  personality = [],
}: PersonaDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const categories = useMemo(
    () =>
      [
        {
          id: "all",
          label: "All",
          items: Array.from(
            new Set([
              ...(interest || []),
              ...(industry || []),
              ...(behavior || []),
              ...(lifestyle || []),
              ...(personality || []),
            ])
          ),
        },
        { id: "interest", label: "Interest", items: interest || [] },
        { id: "industry", label: "Industry", items: industry || [] },
        { id: "lifestyle", label: "Lifestyle", items: lifestyle || [] },
        { id: "behavior", label: "Behavior", items: behavior || [] },
        { id: "personality", label: "Personality", items: personality || [] },
      ].filter((c) => c.items.length > 0 || c.id === "all"),
    [interest, industry, behavior, lifestyle, personality]
  );

  const currentItems = categories.find((c) => c.id === activeTab)?.items || categories[0]?.items || [];

  return (
    <div className={styles.personaCard}>
      <div className={styles.personaHeader}>
        <h5 className={styles.personaTitle}>Targeting & Persona</h5>
        <span className={styles.personaCount}>{categories[0]?.items.length || 0} traits</span>
      </div>
      <div className={styles.personaTabRow}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`${styles.personaTabBtn} ${activeTab === cat.id ? styles.personaTabBtnActive : ""}`}
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.label} ({cat.items.length})
          </button>
        ))}
      </div>
      <div className={styles.personaTagsGrid}>
        {currentItems.length > 0 ? (
          currentItems.map((item) => (
            <span key={item} className={styles.personaTag}>
              {item}
            </span>
          ))
        ) : (
          <span className={styles.emptyPersonaNote}>No targeting attributes assigned yet.</span>
        )}
      </div>
    </div>
  );
}

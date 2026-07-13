"use client";

import React from "react";
import styles from "./page.module.css";

export default function Careers() {
  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Careers at Paayh</h1>
        <p className={styles.subtitle}>
          Join us in building a fair, transparent attention economy for everyone.
        </p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.heading}>Why Work With Us?</h2>
        <p className={styles.text}>
          Paayh is a revolutionary digital platform connecting advertisers with genuine human engagement. 
          We believe in revenue sharing, platform integrity, and high-fidelity user experiences. We are 
          building the future of monetization, advertisement delivery, and instant payout infrastructure.
        </p>

        <h2 className={styles.heading}>Open Roles</h2>
        <p className={styles.text}>
          We are constantly looking for talented and creative individuals. Whether you specialize in 
          React/Next.js engineering, React Native / Expo mobile development, backend API scaling, or 
          product design, we would love to hear from you.
        </p>

        <div className={styles.emailSection}>
          <div className={styles.emailLabel}>How to Apply</div>
          <p className={styles.text} style={{ marginBottom: "1rem", color: "var(--foreground)" }}>
            All interested candidates should send their resume, cover letter, or portfolio directly to our recruiting inbox:
          </p>
          <a href="mailto:xea@paayh.com" className={styles.emailAddress}>
            xea@paayh.com
          </a>
        </div>
      </div>
    </div>
  );
}

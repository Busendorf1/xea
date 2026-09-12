"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, ArrowLeft } from "lucide-react";
import styles from "./not-found.module.css";

export default function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        <div className={styles.iconCircle}>
          <FileQuestion size={28} strokeWidth={1.75} />
        </div>

        <span className={styles.badge}>Error 404</span>

        <h1 className={styles.title}>Page not found</h1>

        <p className={styles.subtitle}>
          The link you followed may be broken or the page may have been removed.
        </p>

        <p className={styles.countdownNotice}>
          Returning to home in {countdown} seconds
        </p>

        <div className={styles.actionGroup}>
          <Link href="/" className={styles.homeButton}>
            <ArrowLeft size={16} strokeWidth={2} />
            <span>Return to Home</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

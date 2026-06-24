"use client";

import styles from "../FrontTextAds/page.module.css";
import Link from "next/link";

export default function FrontTextAds() {
  return (
    <div className={styles.header}>
      <h1>
        Join the fastest lane to 100% ad deliverability! <br />
        You've got to be creative.
      </h1>
      <p className={styles.sub}>
        Be sure your ads will be seen — but performance depends on your offer,
        ad creative, <br /> targeting, timing, season, and other factors.
      </p>
      <Link href="/join" passHref>
        <button className={styles.cta}>ADVERTISE NOW</button>
      </Link>
    </div>
  );
}

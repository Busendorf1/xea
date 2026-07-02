"use client";

// import Link from "next/link";
// import { useState } from "react";
import styles from "./page.module.css";



export default function Footer() {
  

  return (
    <footer className={styles.footer}>
      
        
      {/* <div style={{ textAlign: "center", padding: "10px 0", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic", opacity: 0.55 }}>
        Made on earth by humans &amp; AI will do a lot but humans will buy.
      </div> */}

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Xea! All rights reserved.
      </div>
    </footer>
  );
}

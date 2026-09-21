"use client";

// import Link from "next/link";
// import { useState } from "react";
import styles from "./page.module.css";



export default function Footer() {
  

  return (
    <footer className={styles.footer}>
      

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Paayh! All rights reserved.
      </div>
    </footer>
  );
}

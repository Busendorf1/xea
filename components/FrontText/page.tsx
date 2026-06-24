"use client";

import styles from "../FrontText/page.module.css";
import Link from "next/link";

export default function FrontText() {
  return (
    <div className={styles.heroContainer}>
      {/* Background Glowing Blobs */}
      <div className={styles.glowBlob1}></div>
      <div className={styles.glowBlob2}></div>

      <div className={styles.heroContent}>
        {/* Left Side: Value Proposition */}
        <div className={styles.leftSection}>
          {/* <div className={styles.tagline}>
            <span>Attention Monetization Platform</span>
          </div> */}
          <h1 className={styles.title}>
            Advertize your business.<br />
            <span className={styles.gradientText}>Reward your audience.</span>
          </h1>
           {/* <h1 className={styles.title}>
            Your Attention Is Valuable.<br />
            <span className={styles.gradientText}>Get Rewarded For It.</span>
          </h1> */}
          <p className={styles.subtitle}>
          100% Ads deliverability. We share 60% of ads revenue with geniune ads listeners.
          </p>
           {/* <p className={styles.subtitle}>
            Discover curated offers, jobs, and announcements tailored specifically to your background and interests. Earn guaranteed cash payouts for every second of your engagement.
          </p> */}

          {/* <div className={styles.featuresList}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>🤩</div>
              <div>
                <h4>Smart Matching</h4>
                <p>See ads only relevant to your interests, traits, and industry.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>💰</div>
              <div>
                <h4>Guaranteed Earnings</h4>
                <p>Earn direct UBI payouts directly credited to your digital wallet.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>⚡</div>
              <div>
                <h4>Zero Hassle Sign In</h4>
                <p>Use your existing Google/Gmail account for single-tap onboarding.</p>
              </div>
            </div>
          </div> */}
        </div>

        {/* Right Side: Login Card */}
        <div className={styles.rightSection}>
          <div className={styles.loginCard}>
            <div className={styles.cardHeader}>
              <h3>Get Started</h3>
              <p>Sign in or register to join us</p>
            </div>

            <a 
              href="/auth/login?connection=google-oauth2" 
              className={styles.googleLoginBtn}
            >
              <svg 
                className={styles.googleIcon} 
                viewBox="0 0 24 24" 
                width="20" 
                height="20"
              >
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.755 1.059 15.027 0 12 0 7.37 0 3.382 2.673 1.482 6.555l3.784 3.21z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.275c0-.825-.075-1.613-.206-2.383H12v4.568h6.488a5.64 5.64 0 0 1-2.446 3.7l3.797 3.22c2.21-2.036 3.653-5.043 3.653-8.105z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.266 14.235L1.482 17.445A11.954 11.954 0 0 0 12 24c3.045 0 5.808-1.009 7.839-2.738l-3.797-3.22a7.1 7.1 0 0 1-4.042 1.139 7.068 7.068 0 0 1-6.734-4.946z"
                />
                <path
                  fill="#34A853"
                  d="M1.482 6.555c-.307.92-.482 1.9-.482 2.924s.175 2.004.482 2.924l3.784-3.21a7.06 7.06 0 0 1 0-5.428L1.482 6.555z"
                />
              </svg>
              <span>Continue with Google</span>
            </a>

            <div className={styles.cardFooter}>
              <p>🔒 Secured by Auth0 Universal Identity System.</p>
              <p>By signing in, you agree to our <Link href="/policy">Terms &amp; Conditions</Link>.</p>
              <p style={{ fontSize: "0.7rem", opacity: 0.45, marginTop: "0.25rem", fontStyle: "italic" }}>
                We are all humans here!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


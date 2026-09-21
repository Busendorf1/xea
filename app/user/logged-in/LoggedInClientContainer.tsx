"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";
import myAdsStyles from "../myads/page.module.css";

// Clean Spinner Component for Dynamic Loading (Zero Text)
const SimpleLoader = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "4rem 0" }}>
    <style>{`
      @keyframes spinLoader {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    <div style={{
      width: "32px",
      height: "32px",
      border: "3px solid rgba(255, 255, 255, 0.15)",
      borderTopColor: "#ffffff",
      borderRadius: "50%",
      animation: "spinLoader 0.8s linear infinite"
    }} />
  </div>
);

// Dynamic Code Splitting with clean loading state (client-rendered to avoid missing SSR chunk errors)
const MultiStepAdForm = dynamic(() => import("@/components/Ad/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const Monetize = dynamic(() => import("@/components/Monetize/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const MyNews = dynamic(() => import("@/components/MyNews/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const MyAds = dynamic(() => import("@/components/MyAds/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const UpdateProfile = dynamic(() => import("@/components/Update/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const NewsComponent = dynamic(() => import("@/components/News/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const DeactivateAccount = dynamic(() => import("@/components/Deactivate/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

const StatementPageContent = dynamic(() => import("@/components/Statement/page"), {
  loading: () => <SimpleLoader />,
  ssr: false,
});

import DashboardClient from "@/components/DashboardClient/page";

export type TabKey = 
  | "feed"
  | "adPage" 
  | "monetize" 
  | "myads" 
  | "profile" 
  | "statement" 
  | "news" 
  | "deactivate";

interface Props {
  session: any;
  initialMonetized?: boolean;
  initialClicks?: number;
  initialAtwTier?: string;
  initialTab?: TabKey;
  user?: any;
  parsedInterest?: any;
  email?: string;
  initialAds?: any[];
  initialProfiles?: Record<string, any>;
}

const VALID_TABS: TabKey[] = ["feed", "adPage", "monetize", "myads", "profile", "statement", "news", "deactivate"];

export default function LoggedInClientContainer({ 
  session, 
  initialMonetized, 
  initialClicks, 
  initialAtwTier,
  initialTab = "feed",
  user,
  parsedInterest,
  email,
  initialAds,
  initialProfiles,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() => new Set([initialTab]));

  const checkAndSetTab = () => {
    if (typeof window === "undefined") return;

    let finalTab: TabKey = initialTab;

    // 1. Check query param first (e.g. ?view=monetize)
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get("view") as TabKey;
    const editIdParam = urlParams.get("id");

    // Check cookie for edit id
    const cookiesList = document.cookie.split("; ");
    const editCookie = cookiesList.find((c) => c.trim().startsWith("paayh_edit_ad_id="));
    const cookieEditId = editCookie ? editCookie.trim().split("=")[1] : null;
    const finalEditId = editIdParam || cookieEditId;

    if (finalEditId) {
      sessionStorage.setItem("paayh_edit_ad_id", finalEditId);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("paayh_edit_ad", { detail: { adId: finalEditId } }));
      }, 50);
    }

    const boostRef = urlParams.get("boost_ref") || urlParams.get("reference") || urlParams.get("trxref");
    if (boostRef && boostRef.startsWith("BOOST-")) {
      sessionStorage.setItem("paayh_boost_ref", boostRef);
      finalTab = "myads";
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("paayh_boost_ref", { detail: { reference: boostRef } }));
      }, 100);
    } else if (urlParams.get("reference") || urlParams.get("trxref")) {
      // General payment callback (e.g. ad submission payment)
      finalTab = "statement";
    }

    if (viewParam && VALID_TABS.includes(viewParam)) {
      finalTab = viewParam;
    } else if (!boostRef && !(urlParams.get("reference") || urlParams.get("trxref"))) {
      // 2. Check for cookie set by server redirects
      const tabCookie = cookiesList.find((c) => c.trim().startsWith("paayh_active_tab="));
      if (tabCookie) {
        const cookieTab = tabCookie.trim().split("=")[1] as TabKey;
        if (VALID_TABS.includes(cookieTab)) finalTab = cookieTab;
      } else {
        // 3. Check sessionStorage
        const storedTab = sessionStorage.getItem("paayh_active_tab") as TabKey;
        if (storedTab && VALID_TABS.includes(storedTab)) {
          finalTab = storedTab;
        }
      }
    }

    // Clean cookies after reading
    document.cookie = "paayh_active_tab=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "paayh_edit_ad_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    setActiveTab(finalTab);
    sessionStorage.setItem("paayh_active_tab", finalTab);

    if (window.location.pathname !== "/logged-in" || window.location.search !== "") {
      window.history.replaceState(null, "", "/logged-in");
    }
  };

  useEffect(() => {
    checkAndSetTab();

    const handleTabChangeEvent = () => {
      const stored = sessionStorage.getItem("paayh_active_tab") as TabKey;
      if (stored) setActiveTab(stored);
      window.history.replaceState(null, "", "/logged-in");
    };

    window.addEventListener("paayh_tab_change", handleTabChangeEvent);
    window.addEventListener("popstate", handleTabChangeEvent);

    return () => {
      window.removeEventListener("paayh_tab_change", handleTabChangeEvent);
      window.removeEventListener("popstate", handleTabChangeEvent);
    };
  }, []);

  // Maintain visited tabs set for 0ms Keep-Alive component caching
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Background preloading of dynamic import JS bundles during browser idle time
  useEffect(() => {
    const idleCallback = typeof window !== "undefined" && (window as any).requestIdleCallback;
    if (idleCallback) {
      idleCallback(() => {
        import("@/components/Ad/page");
        import("@/components/Monetize/page");
        import("@/components/MyAds/page");
        import("@/components/MyNews/page");
        import("@/components/News/page");
        import("@/components/Statement/page");
        import("@/components/Update/page");
        import("@/components/Deactivate/page");
      });
    }
  }, []);

  if (activeTab === "feed") {
    return (
      <DashboardClient 
        user={user} 
        parsedInterest={parsedInterest} 
        email={email || session?.user?.email} 
        initialAds={initialAds}
        initialProfiles={initialProfiles}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <HeaderJoin />

      {/* Main Dynamic View Content driven by Gear Menu & Caching */}
      <main className="flex-1">
        {visitedTabs.has("adPage") && (
          <div style={{ display: activeTab === "adPage" ? "block" : "none" }} className="py-4">
            <MultiStepAdForm session={session} />
          </div>
        )}

        {visitedTabs.has("monetize") && (
          <div style={{ display: activeTab === "monetize" ? "block" : "none" }} className="py-4">
            <Monetize 
              session={session} 
              initialMonetized={initialMonetized}
              initialClicks={initialClicks}
              initialAtwTier={initialAtwTier}
            />
          </div>
        )}

        {visitedTabs.has("myads") && (
          <div style={{ display: activeTab === "myads" ? "block" : "none" }} className={myAdsStyles.pageContainer}>
            <h1 className={myAdsStyles.pageTitle}>Publications</h1>
            <section className={myAdsStyles.section}>
              <h2 className={myAdsStyles.sectionTitle}>Highlights</h2>
              <MyNews session={session} />
            </section>
            <section className={myAdsStyles.section}>
              <h2 className={myAdsStyles.sectionTitle}>Adverts</h2>
              <MyAds session={session} />
            </section>
          </div>
        )}

        {visitedTabs.has("news") && (
          <div style={{ display: activeTab === "news" ? "block" : "none" }} className="py-4">
            <NewsComponent session={session} />
          </div>
        )}

        {visitedTabs.has("statement") && (
          <div style={{ display: activeTab === "statement" ? "block" : "none" }}>
            <StatementPageContent />
          </div>
        )}

        {visitedTabs.has("profile") && (
          <div style={{ display: activeTab === "profile" ? "block" : "none" }} className="py-4">
            <UpdateProfile email={session.user?.email} />
          </div>
        )}

        {visitedTabs.has("deactivate") && (
          <div style={{ display: activeTab === "deactivate" ? "block" : "none" }} className="py-4">
            <DeactivateAccount session={session} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

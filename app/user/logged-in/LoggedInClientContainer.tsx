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

// Dynamic Code Splitting with clean loading state
const MultiStepAdForm = dynamic(() => import("@/components/Ad/page"), {
  loading: () => <SimpleLoader />,
});

const Monetize = dynamic(() => import("@/components/Monetize/page"), {
  loading: () => <SimpleLoader />,
});

const MyNews = dynamic(() => import("@/components/MyNews/page"), {
  loading: () => <SimpleLoader />,
});

const MyAds = dynamic(() => import("@/components/MyAds/page"), {
  loading: () => <SimpleLoader />,
});

const UpdateProfile = dynamic(() => import("@/components/Update/page"), {
  loading: () => <SimpleLoader />,
});

const NewsComponent = dynamic(() => import("@/components/News/page"), {
  loading: () => <SimpleLoader />,
});

const DeactivateAccount = dynamic(() => import("@/components/Deactivate/page"), {
  loading: () => <SimpleLoader />,
});

const StatementPageContent = dynamic(() => import("@/components/Statement/page"), {
  loading: () => <SimpleLoader />,
});

export type TabKey = 
  | "adPage" 
  | "monetize" 
  | "myads" 
  | "profile" 
  | "statement" 
  | "news" 
  | "deactivate";

interface Props {
  session: any;
}

export default function LoggedInClientContainer({ session }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("adPage");
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(["adPage"]));

  const checkAndSetTab = () => {
    // 1. Check for cookie set by server redirects
    const cookies = document.cookie.split("; ");
    const tabCookie = cookies.find((c) => c.startsWith("paayh_active_tab="));
    let targetTab: TabKey | null = null;

    if (tabCookie) {
      targetTab = tabCookie.split("=")[1] as TabKey;
      document.cookie = "paayh_active_tab=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }

    // 2. Check query param fallback if any exists, then strip it instantly
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get("view") as TabKey;

    // 3. Check sessionStorage
    const storedTab = sessionStorage.getItem("paayh_active_tab") as TabKey;

    const validTabs: TabKey[] = ["adPage", "monetize", "myads", "profile", "statement", "news", "deactivate"];

    const finalTab = (targetTab && validTabs.includes(targetTab))
      ? targetTab
      : (viewParam && validTabs.includes(viewParam))
      ? viewParam
      : (storedTab && validTabs.includes(storedTab))
      ? storedTab
      : "adPage";

    setActiveTab(finalTab);
    sessionStorage.setItem("paayh_active_tab", finalTab);

    if (window.location.pathname !== "/user/logged-in" || window.location.search !== "") {
      window.history.replaceState(null, "", "/user/logged-in");
    }
  };

  useEffect(() => {
    checkAndSetTab();

    const handleTabChangeEvent = () => {
      const stored = sessionStorage.getItem("paayh_active_tab") as TabKey;
      if (stored) setActiveTab(stored);
      window.history.replaceState(null, "", "/user/logged-in");
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
            <Monetize session={session} />
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

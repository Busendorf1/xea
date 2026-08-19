"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "../MyNews/page.module.css";
import Link from "next/link";
import { Pause, Play, Edit3, AlertTriangle, MapPin, Zap, Calendar } from "lucide-react";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MyNewsProps = {
  session: Session;
};

type HighlightItem = {
  id: string;
  image_url: string;
  title: string;
  interest: string;
  content: string;
  country?: string | null;
  state?: string | null;
  province?: string | null;
  created_at: string | null;
  is_paused?: boolean | null;
  admin_statement?: string | null;
  is_bidded?: boolean | null;
  bid_price?: number | null;
  campaign_days?: number | null;
};

export default function MyNewsDashboard({ session }: MyNewsProps) {
  const [reviewNews, setReviewNews] = useState<HighlightItem[]>([]);
  const [activeNews, setActiveNews] = useState<HighlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchNews = async () => {
    const email = session?.user?.email;
    if (!email) return;
    try {
      const [reviewRes, activeRes] = await Promise.all([
        supabase.from("news").select("*").eq("user_email", email).order("created_at", { ascending: false }),
        supabase.from("newsactive").select("*").eq("user_email", email).order("created_at", { ascending: false }),
      ]);

      if (reviewRes.error || activeRes.error) throw new Error();

      setReviewNews(reviewRes.data || []);
      setActiveNews(activeRes.data || []);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) fetchNews();
  }, [session]);

  const handleTogglePause = async (item: HighlightItem) => {
    if (item.admin_statement && item.is_paused) {
      alert("Highlight Paused, follow instruction provided");
      return;
    }

    const nextState = !item.is_paused;
    setActionLoading(item.id);

    try {
      const res = await fetch("/api/highlights/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highlightId: item.id,
          isPaused: nextState
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Limit reached, try again later.");
      } else {
        fetchNews();
      }
    } catch (err: any) {
      alert("Failed to toggle pause: " + (err.message || "Network error"));
    } finally {
      setActionLoading(null);
    }
  };

  function formatTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return "Unknown time";
    const created = new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - created.getTime()) / 1000;

    if (isNaN(diff)) return "Invalid date";
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour(s) ago`;
    if (diff < 172800) return "Yesterday";

    return created.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const renderAdCard = (item: HighlightItem, status: "review" | "active") => (
    <div key={item.id} className={styles.card} style={{ opacity: item.is_paused ? 0.85 : 1 }}>
      <div className={styles.mediaBox}>
        {/\.(mp4|webm)/i.test(item.image_url || "") ? (
          <video
            src={item.image_url || ""}
            controls
            className={styles.adImgElement}
            style={{ maxHeight: "240px", background: "#000" }}
          />
        ) : (
          <img
            src={item.image_url || "/placeholder.png"}
            alt="Highlight cover"
            className={styles.adImgElement}
          />
        )}
        <span className={status === "active" ? (item.is_paused ? styles.badgeReview : styles.badgeActive) : styles.badgeReview}>
          {status === "active" ? (item.is_paused ? "Paused" : "Active") : "In Review"}
        </span>
      </div>

      <div className={styles.cardContent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
          <span className={styles.interestTag}>{item.interest}</span>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <Link href={`/user/news?editingId=${item.id}`}>
              <button style={{ background: "transparent", border: "1px solid var(--card-border)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.75rem", color: "var(--foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", fontWeight: 600 }}>
                <Edit3 size={12} /> Edit
              </button>
            </Link>
            {status === "active" && (
              <button
                onClick={() => handleTogglePause(item)}
                disabled={actionLoading === item.id}
                style={{ background: "transparent", border: "1px solid var(--card-border)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.75rem", color: item.is_paused ? "#10b981" : "#f59e0b", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", fontWeight: 600 }}
              >
                {item.is_paused ? <Play size={12} /> : <Pause size={12} />}
                {item.is_paused ? "Resume" : "Pause"}
              </button>
            )}
          </div>
        </div>

        <h4 className={styles.adTitle}>{item.title}</h4>
        <p className={styles.adDescription}>{item.content}</p>

        {/* Admin Statement */}
        {item.admin_statement && (
          <div style={{ padding: "0.5rem 0.75rem", backgroundColor: "rgba(245, 158, 11, 0.12)", borderRadius: "6px", border: "1px solid rgba(245, 158, 11, 0.4)", color: "#f59e0b", fontSize: "0.78rem", marginTop: "0.5rem" }}>
            <strong style={{ display: "flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={13} color="#f59e0b" /> Important Notice / Reason:</strong>
            {item.admin_statement}
          </div>
        )}

        {/* Bidded & Location Badges */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          {(!!item.is_bidded || Number(item.bid_price || 0) > 1000) && (
            <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
              <Zap size={11} color="#f59e0b" /> Bidded (₦{item.bid_price || 1500}/day)
            </span>
          )}
          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--sidebar-bg)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
            <MapPin size={11} /> {item.country || "Global"} {item.state ? `(${item.state}${item.province ? `, ${item.province}` : ""})` : ""}
          </span>
          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--sidebar-bg)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
            <Calendar size={11} /> {item.campaign_days || 1} {(item.campaign_days || 1) === 1 ? "Day" : "Days"}
          </span>
        </div>

        <div className={styles.cardFooter}>
          <p className={styles.adCoverage}>
            Will be seen by users in the same interest category
          </p>
          <p className={styles.adTime}>
            Posted {formatTimestamp(item.created_at?.toString())}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.feedContainer}>
      {loading && <p className={styles.loading}>Loading Highlights...</p>}
      {!loading && error && <p className={styles.error}>Error loading Highlights.</p>}
      
      <h3 className={styles.subheading}>Highlights in Review</h3>
      {!loading && reviewNews.length === 0 && <p className={styles.noAds}>No Highlights in review.</p>}
      <div className={styles.adGrid}>
        {reviewNews.map((ad) => renderAdCard(ad, "review"))}
      </div>

      <h3 className={styles.subheading}>Active Highlights</h3>
      {!loading && activeNews.length === 0 ? (
        <>
          <p className={styles.noAds}>
            You do not have any active Highlights. Post one now!
          </p>
          <div className={styles.postButtonContainer}>
            <Link href="/user/news">
              <button className={styles.postButton}>Post a Highlight</button>
            </Link>
          </div>
        </>
      ) : (
        <div className={styles.adGrid}>
          {activeNews.map((ad) => renderAdCard(ad, "active"))}
        </div>
      )}
    </div>
  );
}

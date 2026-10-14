"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Globe,
  Check,
  X,
} from "lucide-react";
import styles from "./page.module.css";

interface AdminBrandSubscribersTabProps {
  renderPagination: (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit?: number,
    setLimit?: (l: number) => void
  ) => React.ReactNode;
}

export default function AdminBrandSubscribersTab({ renderPagination }: AdminBrandSubscribersTabProps) {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [subscribersPage, setSubscribersPage] = useState(0);
  const [subscribersLimit, setSubscribersLimit] = useState(10);
  const [subscribersStatus, setSubscribersStatus] = useState<"all" | "pending" | "approved" | "active" | "rejected">("all");
  const [subscribersSearch, setSubscribersSearch] = useState("");
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersMetrics, setSubscribersMetrics] = useState({ total: 0, pending: 0, active: 0, approved: 0, rejected: 0 });
  const [subscriberActionLoading, setSubscriberActionLoading] = useState<string | null>(null);

  const fetchSubscribers = async (
    page = subscribersPage,
    limit = subscribersLimit,
    status = subscribersStatus,
    search = subscribersSearch,
    fresh = false
  ) => {
    setSubscribersLoading(true);
    try {
      const res = await fetch(
        `/api/admin/subscribers?page=${page}&limit=${limit}&status=${status}&search=${encodeURIComponent(search || "")}${fresh ? "&fresh=true" : ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch subscribers");
      const data = await res.json();
      setSubscribers(data.subscribers || []);
      setSubscribersCount(data.count || 0);
      if (data.metrics) setSubscribersMetrics(data.metrics);
    } catch (e) {
      console.error("Error fetching subscribers:", e);
    } finally {
      setSubscribersLoading(false);
    }
  };

  const handleApproveSubscriber = async (subscriber: any) => {
    const formattedAmount =
      subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`;
    if (
      !confirm(
        `Are you sure you want to APPROVE the brand subscription for ${subscriber.domain} (${subscriber.business_name})?\n\nOnce approved, the user can complete payment of ${formattedAmount} to activate their 30% discount subsidy.`
      )
    ) {
      return;
    }
    setSubscriberActionLoading(subscriber.id);
    try {
      const res = await fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_subscriber", subscriber_id: subscriber.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to approve subscriber");
      alert(data.message || "Application approved successfully!");
      await fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true);
    } catch (e: any) {
      alert("Error approving subscriber: " + e.message);
    } finally {
      setSubscriberActionLoading(null);
    }
  };

  const handleRejectSubscriber = async (subscriber: any) => {
    const reason = prompt(
      `Enter reason for REJECTING ${subscriber.domain} (${subscriber.business_name}):`,
      "Domain or business information could not be verified."
    );
    if (reason === null) return;
    setSubscriberActionLoading(subscriber.id);
    try {
      const res = await fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_subscriber", subscriber_id: subscriber.id, rejection_reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to reject subscriber");
      alert(data.message || "Application rejected.");
      await fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true);
    } catch (e: any) {
      alert("Error rejecting subscriber: " + e.message);
    } finally {
      setSubscriberActionLoading(null);
    }
  };

  useEffect(() => {
    fetchSubscribers(0, subscribersLimit, "all", "", true);
  }, []);

  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>Brand Registrations and Premium Subscribers</h1>
        <p className={styles.sectionSubtitle}>
          Review business domain applications, authorize 30% ad subsidy approvals, and monitor activation payment records.
        </p>
      </div>

      {/* Metrics Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Applications</span>
            <Building2 size={18} color="#3b82f6" />
          </div>
          <div className={styles.statValue}>{subscribersMetrics.total}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Pending Review</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div className={`${styles.statValue} ${styles.textWarning}`}>{subscribersMetrics.pending}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Approved (Awaiting Payment)</span>
            <ShieldCheck size={18} color="#60a5fa" />
          </div>
          <div className={`${styles.statValue} ${styles.adminCls_133}`}>{subscribersMetrics.approved}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Active Subscribers (Paid)</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div className={`${styles.statValue} ${styles.textSuccess}`}>{subscribersMetrics.active}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.adminCls_134}>
        <div className={styles.adminCls_135}>
          {(["all", "pending", "approved", "active", "rejected"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setSubscribersStatus(st);
                setSubscribersPage(0);
                fetchSubscribers(0, subscribersLimit, st, subscribersSearch, true);
              }}
              className={styles.btnAction}
              style={{
                padding: "6px 14px",
                fontSize: "0.85rem",
                fontWeight: 600,
                textTransform: "capitalize",
                backgroundColor: subscribersStatus === st ? "var(--primary)" : "var(--card-bg)",
                color: subscribersStatus === st ? "var(--background)" : "var(--text-muted)",
                border: subscribersStatus === st ? "1px solid var(--primary)" : "1px solid var(--card-border)",
              }}
            >
              {st === "all" ? "All Applications" : st === "approved" ? "Approved (Unpaid)" : st === "active" ? "Active (Paid)" : st}
            </button>
          ))}
        </div>

        <div className={styles.adminCls_136}>
          <input
            type="text"
            placeholder="Search domain, business, or email..."
            value={subscribersSearch}
            onChange={(e) => setSubscribersSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSubscribersPage(0);
                fetchSubscribers(0, subscribersLimit, subscribersStatus, subscribersSearch, true);
              }
            }}
            className={`${styles.modalInput} ${styles.adminCls_137}`}
          />
          <button
            type="button"
            onClick={() => {
              setSubscribersPage(0);
              fetchSubscribers(0, subscribersLimit, subscribersStatus, subscribersSearch, true);
            }}
            className={`${styles.btnAction} ${styles.adminCls_138}`}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true)}
            disabled={subscribersLoading}
            className={`${styles.btnAction} ${styles.adminCls_139}`}
          >
            <RefreshCw size={13} className={subscribersLoading ? "spin" : ""} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Subscribers List */}
      {subscribersLoading ? (
        <div className={styles.loadingText}>Fetching brand subscriber records...</div>
      ) : subscribers.length === 0 ? (
        <div className={styles.emptyState}>No brand applications found matching the selected criteria.</div>
      ) : (
        <div className={styles.cardsGrid}>
          {subscribers.map((sub: any) => {
            const isPending = sub.status === "pending";
            const isApproved = sub.status === "approved";
            const isActive = sub.status === "active";
            const isRejected = sub.status === "rejected";

            const badgeBg = isPending
              ? "rgba(245,158,11,0.15)"
              : isApproved
              ? "rgba(96,165,250,0.15)"
              : isActive
              ? "rgba(16,185,129,0.15)"
              : "rgba(239,68,68,0.15)";
            const badgeColor = isPending
              ? "#f59e0b"
              : isApproved
              ? "#60a5fa"
              : isActive
              ? "#10b981"
              : "#ef4444";

            const formattedAmount =
              sub.currency === "NGN" ? `₦${Number(sub.amount || 150000).toLocaleString()}` : `$${sub.amount || 100}`;

            return (
              <div
                key={sub.id}
                className={styles.cardItem}
                style={{
                  borderLeft: `4px solid ${badgeColor}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={`${styles.cardTitle} ${styles.adminCls_140}`}>
                      <Building2 size={16} color={badgeColor} />
                      <span>{sub.business_name}</span>
                    </h3>
                    <div className={styles.adminCls_141}>
                      <Globe size={13} color="var(--primary, #3b82f6)" />
                      <strong className={styles.adminCls_142}>{sub.domain}</strong>
                    </div>
                  </div>
                  <div className={styles.adminCls_143}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "99px",
                        backgroundColor: badgeBg,
                        color: badgeColor,
                        border: `1px solid ${badgeColor}40`,
                        textTransform: "uppercase",
                      }}
                    >
                      {sub.status}
                    </span>
                    <span className={styles.adminCls_144}>
                      Payment: <strong style={{ color: sub.payment_status === "paid" ? "#10b981" : "#f59e0b" }}>{sub.payment_status || "unpaid"}</strong>
                    </span>
                  </div>
                </div>

                <div className={`${styles.cardBody} ${styles.adminCls_145}`}>
                  <div>
                    <strong>Applicant Email:</strong>{" "}
                    <span className={styles.textForeground}>{sub.user_email || sub.contact_email || "Not specified"}</span>
                  </div>
                  {sub.contact_email && sub.contact_email !== sub.user_email && (
                    <div>
                      <strong>Contact Email:</strong>{" "}
                      <span className={styles.textForeground}>{sub.contact_email}</span>
                    </div>
                  )}
                  <div>
                    <strong>Subscription Fee:</strong>{" "}
                    <span className={styles.adminCls_146}>{formattedAmount}</span>
                    <span className={styles.adminCls_147}>
                      ({sub.discount_percentage || 30}% discount subsidy on ads)
                    </span>
                  </div>
                  <div>
                    <strong>Submitted:</strong>{" "}
                    <span className={styles.adminCls_148}>{new Date(sub.created_at).toLocaleString()}</span>
                  </div>
                  {sub.reviewed_by && (
                    <div>
                      <strong>Reviewed By:</strong>{" "}
                      <span className={styles.adminCls_148}>
                        {sub.reviewed_by} ({sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleDateString() : "date unknown"})
                      </span>
                    </div>
                  )}
                  {sub.rejection_reason && (
                    <div className={styles.adminCls_149}>
                      <strong>Rejection Reason:</strong> {sub.rejection_reason}
                    </div>
                  )}
                  {sub.payment_reference && (
                    <div>
                      <strong>Payment Ref:</strong> <code>{sub.payment_reference}</code>
                    </div>
                  )}
                </div>

                {/* Action Buttons for Admins */}
                <div className={styles.adminCls_150}>
                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApproveSubscriber(sub)}
                        disabled={subscriberActionLoading === sub.id}
                        className={`${styles.btnAction} ${styles.adminCls_151}`}
                      >
                        <CheckCircle2 size={14} />
                        {subscriberActionLoading === sub.id ? "Approving..." : "Approve Application"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectSubscriber(sub)}
                        disabled={subscriberActionLoading === sub.id}
                        className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_152}`}
                      >
                        <X size={14} />
                        Reject
                      </button>
                    </>
                  )}

                  {isApproved && (
                    <div className={styles.adminCls_153}>
                      <span className={styles.adminCls_154}>
                        ⏳ Approved — awaiting brand owner payment of {formattedAmount}.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRejectSubscriber(sub)}
                        disabled={subscriberActionLoading === sub.id}
                        className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_155}`}
                      >
                        Revoke / Reject
                      </button>
                    </div>
                  )}

                  {isActive && (
                    <div className={styles.adminCls_153}>
                      <span className={styles.adminCls_156}>
                        <Check size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                        Active Verified Subscriber (30% Discount Live)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRejectSubscriber(sub)}
                        disabled={subscriberActionLoading === sub.id}
                        className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_155}`}
                      >
                        Suspend Brand
                      </button>
                    </div>
                  )}

                  {isRejected && (
                    <div className={styles.adminCls_153}>
                      <span className={styles.adminCls_157}>Rejected</span>
                      <button
                        type="button"
                        onClick={() => handleApproveSubscriber(sub)}
                        disabled={subscriberActionLoading === sub.id}
                        className={`${styles.btnAction} ${styles.adminCls_158}`}
                      >
                        Re-approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderPagination(
        subscribersPage,
        (newPage) => {
          setSubscribersPage(newPage);
          fetchSubscribers(newPage, subscribersLimit, subscribersStatus, subscribersSearch);
        },
        subscribersCount,
        subscribersLimit,
        (newLimit) => {
          setSubscribersLimit(newLimit);
          setSubscribersPage(0);
          fetchSubscribers(0, newLimit, subscribersStatus, subscribersSearch);
        }
      )}
    </>
  );
}

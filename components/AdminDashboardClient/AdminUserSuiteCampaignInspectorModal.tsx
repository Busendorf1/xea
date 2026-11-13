"use client";

import React from "react";
import { XCircle, Megaphone, Sparkles, Globe, ExternalLink } from "lucide-react";
import styles from "./page.module.css";
import { AdminAdMediaBox } from "./AdminAdMediaBox";

interface AdminUserSuiteCampaignInspectorModalProps {
  inspectingCampaignItem: { item: any; type: "ad" | "highlight" } | null;
  onClose: () => void;
}

export function AdminUserSuiteCampaignInspectorModal({
  inspectingCampaignItem,
  onClose,
}: AdminUserSuiteCampaignInspectorModalProps) {
  if (!inspectingCampaignItem) return null;

  const { item, type } = inspectingCampaignItem;
  const targetUrl =
    item.destination_url ||
    item.link_url ||
    item.target_url ||
    item.link ||
    item.website;

  return (
    <div
      role="presentation"
      className={styles.modalOverlay}
      style={{ zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        className={`${styles.modalContent} ${styles.adminCls_159}`}
        style={{ maxWidth: 660, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div className={styles.adminCls_172}>
            {type === "ad" ? (
              <Megaphone size={20} color="var(--primary)" />
            ) : (
              <Sparkles size={20} color="#f59e0b" />
            )}
            <h3 className={styles.modalTitle}>
              {type === "ad" ? "Ad Campaign Details" : "Business Highlight Details"}
            </h3>
          </div>
          <button
            type="button"
            className={styles.btnClose}
            onClick={onClose}
            title="Close"
          >
            <XCircle size={24} />
          </button>
        </div>

        <div className={styles.modalBody} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {type === "ad" ? (
            <AdminAdMediaBox
              adMedia={item.ad_media || item.ad_media_url || ""}
              adMediaType={item.ad_media_type}
            />
          ) : (
            <div style={{ borderRadius: 10, overflow: "hidden", maxHeight: 260, background: "var(--card-border, #000)", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={item.image_url || item.media || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"}
                alt={item.title || "Highlight cover"}
                style={{ maxHeight: 260, width: "100%", objectFit: "cover" }}
                onError={(e: any) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60";
                }}
              />
            </div>
          )}

          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
              {type === "ad" ? "Campaign / Product Title" : "Highlight Title"}
            </span>
            <h4 style={{ margin: "4px 0 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
              {type === "ad"
                ? item.product_name || item.title || "Ad Campaign"
                : item.title || "Business Highlight"}
            </h4>
          </div>

          <div className={styles.adminCls_173}>
            <div><strong>ID:</strong> <code className={styles.breakAll}>{item.id}</code></div>
            <div><strong>Status:</strong> <span style={{ fontWeight: 700, color: item.is_paused ? "#ef4444" : "#10b981" }}>{item.is_paused ? "Paused" : "Live / Active"}</span></div>
            <div><strong>Creator / Email:</strong> <code className={styles.breakAll}>{item.user_email}</code></div>
            {type === "ad" ? (
              <>
                <div><strong>Ad Type:</strong> <span className={styles.adminCls_174}>{item.ad_type || "Standard"}</span></div>
                <div><strong>Views Delivered:</strong> <span>{item.impression_count || 0} / {item.impressions || "∞"}</span></div>
                <div><strong>Mutual Attention:</strong> <span>{item.mutual_adds_count || 0}</span></div>
                <div><strong>Bid / Cost:</strong> <span>₦{item.cost_per_impression || 25} / view</span></div>
                <div><strong>Duration:</strong> <span>{item.campaign_days || 5} Days</span></div>
                <div><strong>Frequency Cap:</strong> <span>{item.user_frequency_cap || 1} view(s)/user</span></div>
              </>
            ) : (
              <>
                <div><strong>Category / Interest:</strong> <span className={styles.adminCls_174}>{item.interest || "General"}</span></div>
                <div><strong>Publisher Handle:</strong> <span>{item.publisher_handle || (item.user_email ? `@${item.user_email.split("@")[0]}` : "@user")}</span></div>
                {item.publisher_name && (
                  <div><strong>Publisher Name:</strong> <span>{item.publisher_name}</span></div>
                )}
                <div><strong>Target Region:</strong> <span>{item.country || "Global"}{item.state ? ` (${item.state})` : ""}</span></div>
                <div><strong>Daily Rate:</strong> <span>₦{item.bid_price || 1500}/day</span></div>
              </>
            )}
            <div><strong>Created:</strong> <span>{item.created_at ? new Date(item.created_at).toLocaleString() : "N/A"}</span></div>
          </div>

          {(item.content || item.ad_content) && (
            <div className={styles.adminCls_175}>
              <strong className={styles.adminCls_85}>
                {type === "ad" ? "Ad Copy / Content:" : "Highlight Story / Content:"}
              </strong>
              <p className={styles.adminCls_176} style={{ whiteSpace: "pre-line" }}>
                {item.content || item.ad_content}
              </p>
            </div>
          )}

          {targetUrl && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <Globe size={16} color="var(--primary)" />
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Target URL:</span>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: 600, textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {targetUrl}
                </a>
              </div>
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnAction}
                style={{ padding: "4px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
              >
                <span>Visit Link</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          {item.admin_statement && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", fontSize: "0.82rem" }}>
              <strong style={{ color: "#f59e0b" }}>Admin Statement / Note:</strong>
              <p style={{ margin: "4px 0 0", color: "var(--foreground)" }}>{item.admin_statement}</p>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            onClick={onClose}
            className={`${styles.btnAction} ${styles.adminCls_177}`}
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { XCircle, Megaphone, ShieldAlert, User, Wallet, Shield, Users, Edit2, Check, RefreshCw, AlertTriangle, Download, ExternalLink, Sparkles, Globe } from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import MultimediaCarousel from "@/components/MyAds/MultimediaCarousel";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import RoleStarBadges from "@/components/ui/RoleStarBadges";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

import { AdminAdMediaBox } from "./AdminAdMediaBox";
import { AdminUserOperationsSuiteModal } from "./AdminUserOperationsSuiteModal";
export { AdminAdMediaBox, AdminUserOperationsSuiteModal };

export interface AdminDashboardModalsProps {
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  userActionSubmitting: boolean;
  handleAdjustBalance: (user: any, amount: number) => void;
  handleSuspendUser: (user: any, hours: number) => void;
  handleDeleteUser: (user: any) => void;
  handleToggleMonetization?: (user: any) => void;
  handleUpdateUserProfile?: (user: any, updatedFields: Record<string, any>) => Promise<boolean>;
  handleUpdateSpecialRoles?: (user: any, roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }) => void;
  handleToggleAgent?: (user: any, makeAgent: boolean) => void;
  handleBanAgent?: (
    user: any,
    options: {
      banType: "temp" | "perm" | "unban";
      days?: number;
      customUntil?: string;
      reason: string;
      detachFollowers?: boolean;
    }
  ) => void;
  handleRemoveFollower?: (user: any, refereeEmail: string, followerLabel?: string) => void;
  handleRemoveAllFollowers?: (user: any) => void;
  handleDetachUplineAgent?: (user: any, uplineLabel?: string) => void;
  handleDeactivateAccount?: (user: any, deactivated: boolean) => void;
  handleResetClicks?: (user: any, clicks: number) => void;
  editAdData: any;
  setEditAdData: (d: any) => void;
  handleSaveAdEdit: (e: React.FormEvent) => void;
  editHighlightData: any;
  setEditHighlightData: (d: any) => void;
  handleSaveHighlightEdit: (e: React.FormEvent) => void;
  interestsList: string[];
  replyingTicket: any;
  setReplyingTicket: (t: any) => void;
  replyText: string;
  setReplyText: (s: string) => void;
  replyLoading: boolean;
  handleReplyTicket: (id: string) => void;
  inspectingAd: any;
  setInspectingAd: (a: any) => void;
  handleDeactivateReportedAd: (adId: string, reportId: string) => void;
  banModalUser: any;
  setBanModalUser: (u: any) => void;
  banModalStatus: "active" | "temp_banned" | "perm_banned" | "deactivated";
  setBanModalStatus: (s: "active" | "temp_banned" | "perm_banned" | "deactivated") => void;
  banModalDays: number;
  setBanModalDays: (d: number) => void;
  banModalReason: string;
  setBanModalReason: (r: string) => void;
  banSubmitting: boolean;
  handleExecuteAdBan: () => void;
  activeActionId?: string | null;
}

export const AdminDashboardModals: React.FC<AdminDashboardModalsProps> = React.memo(function AdminDashboardModals({
  selectedUser,
  setSelectedUser,
  userActionSubmitting,
  handleAdjustBalance,
  handleSuspendUser,
  handleDeleteUser,
  handleToggleMonetization,
  handleUpdateUserProfile,
  handleUpdateSpecialRoles,
  handleToggleAgent,
  handleBanAgent,
  handleRemoveFollower,
  handleRemoveAllFollowers,
  handleDetachUplineAgent,
  handleDeactivateAccount,
  handleResetClicks,
  editAdData,
  setEditAdData,
  handleSaveAdEdit,
  editHighlightData,
  setEditHighlightData,
  handleSaveHighlightEdit,
  interestsList,
  replyingTicket,
  setReplyingTicket,
  replyText,
  setReplyText,
  replyLoading,
  handleReplyTicket,
  inspectingAd,
  setInspectingAd,
  handleDeactivateReportedAd,
  banModalUser,
  setBanModalUser,
  banModalStatus,
  setBanModalStatus,
  banModalDays,
  setBanModalDays,
  banModalReason,
  setBanModalReason,
  banSubmitting,
  handleExecuteAdBan,
  activeActionId,
}: AdminDashboardModalsProps) {
  return (
    <>
      {/* MODAL: USER OPERATIONS SUITE (PROFILE, STATEMENTS, FOLLOWERS/AGENT, SECURITY) */}
      <AdminUserOperationsSuiteModal
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        userActionSubmitting={userActionSubmitting}
        activeActionId={activeActionId}
        handleAdjustBalance={handleAdjustBalance}
        handleSuspendUser={handleSuspendUser}
        handleDeleteUser={handleDeleteUser}
        handleToggleMonetization={handleToggleMonetization}
        handleUpdateUserProfile={handleUpdateUserProfile}
        handleUpdateSpecialRoles={handleUpdateSpecialRoles}
        handleToggleAgent={handleToggleAgent}
        handleBanAgent={handleBanAgent}
        handleRemoveFollower={handleRemoveFollower}
        handleRemoveAllFollowers={handleRemoveAllFollowers}
        handleDetachUplineAgent={handleDetachUplineAgent}
        handleDeactivateAccount={handleDeactivateAccount}
        handleResetClicks={handleResetClicks}
        setBanModalUser={setBanModalUser}
        setBanModalStatus={setBanModalStatus}
        setBanModalReason={setBanModalReason}
      />

      {/* MODAL: EDIT ACTIVE AD */}
      {editAdData && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.adminCls_167}`}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Ad Campaign Details</h3>
              <button onClick={() => setEditAdData(null)} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleSaveAdEdit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Target Impressions</label>
                  <input
                    type="number"
                    required
                    value={editAdData.impressions || 1000}
                    onChange={(e) => setEditAdData({ ...editAdData, impressions: parseInt(e.target.value) || 0 })}
                    className={styles.inputField}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Campaign Duration (Days)</label>
                  <input
                    type="number"
                    required
                    value={editAdData.campaign_days || 5}
                    onChange={(e) => setEditAdData({ ...editAdData, campaign_days: parseInt(e.target.value) || 0 })}
                    className={styles.inputField}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Frequency Cap (Views per User)</label>
                  <select
                    value={editAdData.user_frequency_cap || 1}
                    onChange={(e) => setEditAdData({ ...editAdData, user_frequency_cap: parseInt(e.target.value) || 1 })}
                    className={styles.selectField}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                      <option key={val} value={val}>{val} view(s)</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ad Content Text</label>
                  <textarea
                    required
                    value={editAdData.ad_content || ""}
                    onChange={(e) => setEditAdData({ ...editAdData, ad_content: e.target.value })}
                    className={styles.textareaField}
                  />
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Phone Link</label>
                    <input
                      type="text"
                      value={editAdData.action_phone || ""}
                      onChange={(e) => setEditAdData({ ...editAdData, action_phone: e.target.value })}
                      className={styles.inputField}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Whatsapp Link</label>
                    <input
                      type="text"
                      value={editAdData.action_whatsapp || ""}
                      onChange={(e) => setEditAdData({ ...editAdData, action_whatsapp: e.target.value })}
                      className={styles.inputField}
                    />
                  </div>
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Website Link</label>
                    <input
                      type="text"
                      value={editAdData.action_website || ""}
                      onChange={(e) => setEditAdData({ ...editAdData, action_website: e.target.value })}
                      className={styles.inputField}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Email Link</label>
                    <input
                      type="email"
                      value={editAdData.action_email || ""}
                      onChange={(e) => setEditAdData({ ...editAdData, action_email: e.target.value })}
                      className={styles.inputField}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setEditAdData(null)} className={styles.btnAction}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit}>
                  Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ACTIVE HIGHLIGHT */}
      {editHighlightData && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.adminCls_168}`}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Business Highlight</h3>
              <button onClick={() => setEditHighlightData(null)} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleSaveHighlightEdit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Highlight Title</label>
                  <input
                    type="text"
                    required
                    value={editHighlightData.title || ""}
                    onChange={(e) => setEditHighlightData({ ...editHighlightData, title: e.target.value })}
                    className={styles.inputField}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Interest Category</label>
                  <select
                    value={editHighlightData.interest || "Business"}
                    onChange={(e) => setEditHighlightData({ ...editHighlightData, interest: e.target.value })}
                    className={styles.selectField}
                  >
                    {interestsList.map((int) => (
                      <option key={int} value={int}>{int}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Cover Image URL</label>
                  <input
                    type="text"
                    required
                    value={editHighlightData.image_url || ""}
                    onChange={(e) => setEditHighlightData({ ...editHighlightData, image_url: e.target.value })}
                    className={styles.inputField}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Details Content</label>
                  <textarea
                    required
                    value={editHighlightData.content || ""}
                    onChange={(e) => setEditHighlightData({ ...editHighlightData, content: e.target.value })}
                    className={styles.textareaField}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setEditHighlightData(null)} className={styles.btnAction}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit}>
                  Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REPLY TO HELP TICKET */}
      {replyingTicket && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Reply to: {replyingTicket.subject}</h3>
              <button onClick={() => { setReplyingTicket(null); setReplyText(""); }} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.adminCls_169}>
                <strong className={styles.textForeground}>From:</strong> {replyingTicket.name ? `${replyingTicket.name} — ` : ""}{replyingTicket.user_email}
              </p>
              <p className={styles.adminCls_170}>
                {replyingTicket.message}
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Your Reply</label>
                <textarea
                  className={`${styles.textareaField} ${styles.adminCls_171}`}
                  rows={5}
                  placeholder="Type your reply here..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" onClick={() => { setReplyingTicket(null); setReplyText(""); }} className={styles.btnAction}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReplyTicket(replyingTicket.id)}
                disabled={replyLoading || !replyText.trim()}
                className={styles.btnSubmit}
              >
                {replyLoading ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT AD DETAILS */}
      {inspectingAd && (
        <div role="presentation" className={styles.modalOverlay} onClick={() => setInspectingAd(null)}>
          <div className={`${styles.modalContent} ${styles.adminCls_159}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_172}>
                <Megaphone size={20} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Ad Details Inspector</h3>
              </div>
              <button className={styles.btnClose} onClick={() => setInspectingAd(null)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <AdminAdMediaBox adMedia={inspectingAd.ad_media || inspectingAd.ad_media_url || ""} adMediaType={inspectingAd.ad_media_type} />

              <div className={styles.adminCls_173}>
                <div><strong>Ad ID:</strong> <code className={styles.breakAll}>{inspectingAd.id}</code></div>
                <div><strong>Ad Type:</strong> <span className={styles.adminCls_174}>{inspectingAd.ad_type}</span></div>
                <div><strong>Advertiser Email:</strong> <code className={styles.breakAll}>{inspectingAd.user_email || inspectingAd.email}</code></div>
                <div><strong>Status:</strong> <span style={{ fontWeight: "700", color: inspectingAd.is_paused ? "#ef4444" : "#10b981" }}>{inspectingAd.is_paused ? "Paused / Deactivated" : "Active"}</span></div>
                <div><strong>Impressions:</strong> <span>{inspectingAd.impression_count || 0} / {inspectingAd.impressions || 0}</span></div>
                <div><strong>Mutual Attention:</strong> <span>{inspectingAd.mutual_adds_count || 0}</span></div>
                <div><strong>Bid / Cost:</strong> <span>₦{inspectingAd.cost_per_impression || 25} / attention</span></div>
                <div><strong>Created:</strong> <span>{inspectingAd.created_at ? new Date(inspectingAd.created_at).toLocaleString() : "N/A"}</span></div>
              </div>

              {inspectingAd.ad_content && (
                <div className={styles.adminCls_175}>
                  <strong className={styles.adminCls_85}>Ad Headline / Content:</strong>
                  <p className={styles.adminCls_176}>{inspectingAd.ad_content}</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                onClick={() => {
                  setInspectingAd(null);
                  handleDeactivateReportedAd(inspectingAd.id, "");
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                Deactivate Ad Campaign
              </button>
              <button onClick={() => setInspectingAd(null)} className={`${styles.btnAction} ${styles.adminCls_177}`}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADVERTISER BAN & DEACTIVATION MANAGEMENT */}
      {banModalUser && (
        <div role="presentation" className={styles.modalOverlay} onClick={() => setBanModalUser(null)}>
          <div className={`${styles.modalContent} ${styles.adminCls_178}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_160}>
                <ShieldAlert size={22} color="#f59e0b" />
                <h3 className={styles.modalTitle}>Manage Advertiser Access</h3>
              </div>
              <button className={styles.btnClose} onClick={() => setBanModalUser(null)}>
                <XCircle size={22} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.userBannerBox}>
                <span className={styles.userBannerLabel}>Target Account:</span>
                <span className={styles.userBannerEmail}>{banModalUser.email}</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Restriction Status</label>
                <select
                  value={banModalStatus}
                  onChange={(e: any) => setBanModalStatus(e.target.value)}
                  className={styles.selectField}
                >
                  <option value="active">Active — Full Advertiser Access</option>
                  <option value="temp_banned">Temporary Ban — Timed Restriction</option>
                  <option value="perm_banned">Permanent Ban — Indefinite Restriction</option>
                  <option value="deactivated">Deactivated — Admin Deactivation</option>
                </select>
              </div>

              {banModalStatus === "temp_banned" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ban Duration (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={banModalDays}
                    onChange={(e) => setBanModalDays(Number(e.target.value))}
                    className={styles.inputField}
                  />
                  <span className={styles.formHelperText}>
                    Account will be automatically unbanned after {banModalDays} day{banModalDays > 1 ? "s" : ""}.
                  </span>
                </div>
              )}

              {banModalStatus !== "active" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reason for Decision (Required)</label>
                  <textarea
                    rows={3}
                    placeholder="Enter reason e.g., Policy violation, misleading advertising content..."
                    value={banModalReason}
                    onChange={(e) => setBanModalReason(e.target.value)}
                    className={styles.textareaField}
                  />
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button type="button" onClick={() => setBanModalUser(null)} className={styles.btnAction}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAdBan}
                disabled={banSubmitting}
                className={`${styles.btnAction} ${banModalStatus === "active" ? styles.btnSuccess : styles.btnDanger}`}
              >
                {banSubmitting ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});


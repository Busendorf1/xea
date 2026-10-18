"use client";

import React from "react";
import styles from "./page.module.css";

interface AdminSendNotificationsTabProps {
  notificationTarget: string;
  setNotificationTarget: (target: "all" | "monetized" | "user") => void;
  notificationTargetEmail: string;
  setNotificationTargetEmail: (email: string) => void;
  notificationTitle: string;
  setNotificationTitle: (title: string) => void;
  notificationMessage: string;
  setNotificationMessage: (message: string) => void;
  notificationSuccessMsg: string;
  notificationErrorMsg: string;
  notificationLoading: boolean;
  handleSendNotification: (e: React.FormEvent) => void;
}

export default function AdminSendNotificationsTab({
  notificationTarget,
  setNotificationTarget,
  notificationTargetEmail,
  setNotificationTargetEmail,
  notificationTitle,
  setNotificationTitle,
  notificationMessage,
  setNotificationMessage,
  notificationSuccessMsg,
  notificationErrorMsg,
  notificationLoading,
  handleSendNotification,
}: AdminSendNotificationsTabProps) {
  return (
    <>
      <h1 className={styles.sectionTitle}>Send Announcements and Payouts Notifications</h1>
      <p className={styles.sectionSubtitle}>
        Broadcast push notifications directly to user segments or specific accounts.
      </p>

      <div className={styles.adminCls_86}>
        <form onSubmit={handleSendNotification} className={styles.adminCls_87}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Notification Target Segment</label>
            <select
              value={notificationTarget}
              onChange={(e: any) => setNotificationTarget(e.target.value)}
              className={`${styles.selectField} ${styles.wFull}`}
            >
              <option value="all">All Registered Users</option>
              <option value="monetized">Monetized Users Only</option>
              <option value="user">Specific User by Email</option>
            </select>
          </div>

          {notificationTarget === "user" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Target User Email Address</label>
              <input
                type="email"
                required
                placeholder="user@example.com"
                value={notificationTargetEmail}
                onChange={(e) => setNotificationTargetEmail(e.target.value)}
                className={`${styles.inputField} ${styles.wFull}`}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Message Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Account Update"
              value={notificationTitle}
              onChange={(e) => setNotificationTitle(e.target.value)}
              className={`${styles.inputField} ${styles.wFull}`}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Message Body Content</label>
            <textarea
              required
              rows={5}
              placeholder="Write your announcement details here..."
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              className={`${styles.textareaField} ${styles.adminCls_88}`}
            />
          </div>

          {notificationSuccessMsg && (
            <div className={styles.adminCls_89}>
              {notificationSuccessMsg}
            </div>
          )}

          {notificationErrorMsg && (
            <div className={styles.adminCls_90}>
              {notificationErrorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={notificationLoading}
            className={`${styles.btnSubmit} ${styles.adminCls_91}`}
          >
            {notificationLoading ? "Broadcasting message..." : "Broadcast Announcement"}
          </button>
        </form>
      </div>
    </>
  );
}

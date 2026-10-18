"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import styles from "./page.module.css";

export interface DlqJob {
  id: string;
  name?: string;
  failedAt?: string | number;
  failedReason?: string;
  data?: any;
  rawPayload?: any;
}

interface AdminQueuesTabProps {
  dlqJobs: DlqJob[];
  dlqCount: number;
  dlqLoading: boolean;
  dlqActionStatus: string;
  handleRetryDlqAll: () => void;
  handleClearDlqAll: () => void;
  handleRetryDlqSingle: (id: string) => void;
}

export default function AdminQueuesTab({
  dlqJobs,
  dlqCount,
  dlqLoading,
  dlqActionStatus,
  handleRetryDlqAll,
  handleClearDlqAll,
  handleRetryDlqSingle,
}: AdminQueuesTabProps) {
  return (
    <>
      <div className={styles.adminCls_96}>
        <div>
          <h1 className={styles.sectionTitle}>Failed Queues and Dead Letter Queue (DLQ)</h1>
          <p className={styles.sectionSubtitle}>
            Inspect background queue jobs that failed maximum retries. Manually trigger retries or clear stale queue entries.
          </p>
        </div>
        <div className={styles.adminCls_97}>
          <button
            onClick={handleRetryDlqAll}
            disabled={dlqLoading || dlqJobs.length === 0}
            className={`${styles.btnAction} ${styles.adminCls_98}`}
          >
            <RefreshCw size={14} className={dlqLoading ? "spin" : ""} />
            <span>Retry All Failed Jobs ({dlqCount})</span>
          </button>
          <button
            onClick={handleClearDlqAll}
            disabled={dlqLoading || dlqJobs.length === 0}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            Clear DLQ
          </button>
        </div>
      </div>

      {dlqActionStatus && (
        <div className={styles.adminCls_99}>
          {dlqActionStatus}
        </div>
      )}

      {dlqLoading ? (
        <div className={styles.loadingText}>Fetching DLQ entries from Redis...</div>
      ) : dlqJobs.length === 0 ? (
        <div className={styles.emptyState}>No failed background queue jobs. All systems operational!</div>
      ) : (
        <div className={styles.cardsGrid}>
          {dlqJobs.map((job) => (
            <div key={job.id} className={styles.cardItem}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Job: {job.name || job.id}</h3>
                  <span className={styles.cardMeta}>
                    Failed at: {job.failedAt ? new Date(job.failedAt).toLocaleString() : "Unknown"}
                  </span>
                </div>
                <span className={styles.adminCls_100}>
                  FAILED
                </span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.adminCls_101}>
                  <strong>Reason:</strong> {job.failedReason || "Exhausted retry limits"}
                </div>
                <pre className={styles.adminCls_102}>
                  {JSON.stringify(job.data || job.rawPayload || {}, null, 2)}
                </pre>
              </div>

              <div className={styles.cardFooter}>
                <button
                  onClick={() => handleRetryDlqSingle(job.id)}
                  className={`${styles.btnAction} ${styles.adminCls_103}`}
                >
                  Retry Job
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

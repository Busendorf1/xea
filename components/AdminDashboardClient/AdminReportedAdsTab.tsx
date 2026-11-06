"use client";

import React from "react";
import { Search } from "lucide-react";
import styles from "./page.module.css";

export interface AdminReportedAdsTabProps {
  loading: boolean;
  reportedAds: any[];
  reportedAdsCount: number;
  reportedAdsPage: number;
  setReportedAdsPage: (p: number) => void;
  reportedAdsSearch: string;
  setReportedAdsSearch: (s: string) => void;
  adActionLoading: string | null;
  handleInspectAd: (id: string) => void;
  handleDeactivateReportedAd: (adId: string, reportId: string) => void;
  handleBlockReportedAdvertiser: (email: string, reportId: string) => void;
  handleDismissReport: (reportId: string) => void;
  renderPagination: (
    page: number,
    setPage: (p: number) => void,
    count: number
  ) => React.ReactNode;
}

export const AdminReportedAdsTab = React.memo(function AdminReportedAdsTab({
  loading,
  reportedAds,
  reportedAdsCount,
  reportedAdsPage,
  setReportedAdsPage,
  reportedAdsSearch,
  setReportedAdsSearch,
  adActionLoading,
  handleInspectAd,
  handleDeactivateReportedAd,
  handleBlockReportedAdvertiser,
  handleDismissReport,
  renderPagination,
}: AdminReportedAdsTabProps) {
  const getReportStatusBadgeClass = (status: string) => {
    if (status === "action_taken") return styles.reportStatusActionTaken;
    if (status === "dismissed") return styles.reportStatusDismissed;
    return styles.reportStatusPending;
  };

  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>Ad Guard and Content Reports</h1>
        <p className={styles.sectionSubtitle}>
          Review user-reported ads and advertisers. Take instant action to remove ad campaigns or block advertiser accounts.
        </p>
      </div>

      <div className={styles.reportSearchBarContainer}>
        <Search className={styles.reportSearchIcon} size={18} />
        <input
          type="text"
          placeholder="Search reports by Ad ID, reporter email, advertiser email, or reason..."
          value={reportedAdsSearch}
          onChange={(e) => {
            setReportedAdsSearch(e.target.value);
            setReportedAdsPage(0);
          }}
          className={styles.reportSearchInput}
        />
      </div>

      {loading ? (
        <div className={styles.loadingText}>Fetching reported ads from database...</div>
      ) : reportedAds.length === 0 ? (
        <div className={styles.emptyState}>No ad or advertiser reports found.</div>
      ) : (
        <>
          <div className={styles.cardsGrid}>
            {reportedAds.map((report) => (
              <div key={report.id} className={styles.cardItem}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Report ID: {report.id.slice(0, 8)}</h3>
                    <span className={styles.cardMeta}>
                      Reported by: <strong className={styles.textForeground}>{report.reporter_email}</strong> · Reported on{" "}
                      {new Date(report.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span className={getReportStatusBadgeClass(report.status)}>
                    {report.status.toUpperCase()}
                  </span>
                </div>

                <div className={`${styles.cardBody} ${styles.adminCls_92}`}>
                  <div>
                    <strong>Report Type:</strong>{" "}
                    <span
                      className={`${styles.refCodeBold} ${
                        report.report_type === "advertiser"
                          ? styles.reportTypeAdvertiser
                          : styles.reportTypeConsumer
                      }`}
                    >
                      {report.report_type === "advertiser"
                        ? "Block and Report Advertiser"
                        : "Block and Report Ad"}
                    </span>
                  </div>
                  <div className={styles.adminCls_93}>
                    <strong>Target Ad ID:</strong>
                    <button
                      type="button"
                      onClick={() => handleInspectAd(report.ad_id)}
                      title="Click to inspect full ad details"
                      className={styles.inspectAdLink}
                    >
                      <span>{report.ad_id}</span>
                      <span>(Inspect Ad Details)</span>
                    </button>
                  </div>
                  {report.advertiser_email && (
                    <div>
                      <strong>Advertiser Email:</strong>{" "}
                      <code className={styles.adminCls_94}>{report.advertiser_email}</code>
                    </div>
                  )}
                  {report.reason && (
                    <div className={styles.reportReasonBox}>
                      <strong className={styles.textForeground}>User Reason:</strong> {report.reason}
                    </div>
                  )}
                </div>

                <div className={`${styles.cardFooter} ${styles.adminCls_95}`}>
                  <button onClick={() => handleInspectAd(report.ad_id)} disabled={Boolean(adActionLoading)} className={styles.inspectAdLink}>
                    Inspect Ad Details
                  </button>
                  <button
                    onClick={() => handleDeactivateReportedAd(report.ad_id, report.id)}
                    disabled={Boolean(adActionLoading)}
                    className={`${styles.btnAction} ${styles.btnDanger}`}
                  >
                    {adActionLoading === `deactivate-${report.id || report.ad_id}` && (
                      <span className={styles.btnSpinner} />
                    )}
                    {adActionLoading === `deactivate-${report.id || report.ad_id}`
                      ? "Deactivating..."
                      : "Deactivate Ad for All Users"}
                  </button>
                  {report.advertiser_email && (
                    <button
                      onClick={() => handleBlockReportedAdvertiser(report.advertiser_email, report.id)}
                      disabled={Boolean(adActionLoading)}
                      className={`${styles.btnAction} ${styles.btnDanger}`}
                    >
                      {adActionLoading === `block-${report.id || report.advertiser_email}` && (
                        <span className={styles.btnSpinner} />
                      )}
                      {adActionLoading === `block-${report.id || report.advertiser_email}`
                        ? "Blocking..."
                        : "Block Advertiser Account"}
                    </button>
                  )}
                  {report.status === "pending" && (
                    <button
                      onClick={() => handleDismissReport(report.id)}
                      disabled={Boolean(adActionLoading)}
                      className={styles.btnAction}
                    >
                      {adActionLoading === `dismiss-${report.id}` && (
                        <span className={styles.btnSpinner} />
                      )}
                      {adActionLoading === `dismiss-${report.id}` ? "Dismissing..." : "Dismiss Report"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {renderPagination(reportedAdsPage, setReportedAdsPage, reportedAdsCount)}
        </>
      )}
    </>
  );
});

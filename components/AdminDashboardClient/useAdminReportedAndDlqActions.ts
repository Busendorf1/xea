"use client";

import { useCallback } from "react";
import { useAdminDialog } from "@/components/ui/AdminDialog";

interface UseAdminReportedAndDlqActionsParams {
  reportedAds: any[];
  setReportedAds: (r: any[]) => void;
  reportedAdsPage: number;
  setReportedAdsCount: (c: number) => void;
  setLoading: (l: boolean) => void;
  setInspectLoading: (l: boolean) => void;
  setInspectingAd: (a: any) => void;
  adActionLoading: string | null;
  setAdActionLoading: (l: string | null) => void;
  searchQuery: string;
  setDlqLoading: (l: boolean) => void;
  setDlqJobs: (j: any[]) => void;
  setDlqCount: (c: number) => void;
  setDlqActionStatus: (s: string) => void;
}

export function useAdminReportedAndDlqActions({
  reportedAds,
  setReportedAds,
  reportedAdsPage,
  setReportedAdsCount,
  setLoading,
  setInspectLoading,
  setInspectingAd,
  adActionLoading,
  setAdActionLoading,
  searchQuery,
  setDlqLoading,
  setDlqJobs,
  setDlqCount,
  setDlqActionStatus,
}: UseAdminReportedAndDlqActionsParams) {
  const { alertDialog, confirmDialog } = useAdminDialog();

  const fetchReportedAds = async (page: number, search: string = "", fresh = false) => {
    if (reportedAds.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports?page=${page}&search=${encodeURIComponent(search)}${
          fresh ? "&fresh=true" : ""
        }`
      );
      const json = await res.json();
      if (res.ok && json.reports) {
        setReportedAds(json.reports);
        setReportedAdsCount(json.count || 0);
      } else if (reportedAds.length === 0) {
        setReportedAds([]);
        setReportedAdsCount(0);
      }
    } catch (e) {
      console.error("Error fetching reported ads:", e);
      if (reportedAds.length === 0) setReportedAds([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInspectAd = async (adId: string) => {
    if (!adId) return;
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/admin/ad-details?id=${encodeURIComponent(adId.trim())}`);
      const json = await res.json();
      if (res.ok && json.ad) {
        setInspectingAd(json.ad);
      } else {
        alert(json.error || `Ad campaign with ID '${adId}' was not found in database.`);
      }
    } catch (e: any) {
      alert("Failed to fetch ad details: " + e.message);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleDeactivateReportedAd = async (adId: string, reportId: string) => {
    if (adActionLoading) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to deactivate ad ${adId} for all users?`,
      "Deactivate Reported Ad",
      true
    );
    if (!confirmed) return;

    const statement = prompt(
      "Reason for deactivating this ad (visible to advertiser):",
      "Deactivated by Admin due to user content reports"
    );
    if (statement === null) return;

    setAdActionLoading(`deactivate-${reportId || adId}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_ad",
          adId,
          reportId,
          statement,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await alertDialog(
        json.message || "Ad campaign deactivated successfully for all users!",
        "Campaign Deactivated"
      );
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      await alertDialog("Failed to deactivate ad: " + e.message, "Error");
    } finally {
      setAdActionLoading(null);
    }
  };

  const handleBlockReportedAdvertiser = async (advertiserEmail: string, reportId: string) => {
    if (adActionLoading) return;
    if (!advertiserEmail) {
      await alertDialog("No advertiser email associated with this report.", "Error");
      return;
    }

    const confirmed = await confirmDialog(
      `Are you sure you want to deactivate all active ads created by advertiser ${advertiserEmail} and permanently ban this advertiser account?`,
      "Block Advertiser & Deactivate Ads",
      true
    );
    if (!confirmed) return;

    const statement = prompt(
      "Reason for banning advertiser and deactivating campaigns (visible to advertiser):",
      "Account suspended by Admin due to multiple content safety reports"
    );
    if (statement === null) return;

    setAdActionLoading(`block-${reportId || advertiserEmail}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block_advertiser",
          advertiserEmail,
          reportId,
          statement,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await alertDialog(
        json.message ||
          `All ads created by advertiser ${advertiserEmail} have been deactivated and the account has been banned.`,
        "Advertiser Blocked"
      );
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      await alertDialog("Failed to block advertiser: " + e.message, "Error");
    } finally {
      setAdActionLoading(null);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    if (adActionLoading) return;
    const confirmed = await confirmDialog(
      "Are you sure you want to dismiss this report? The ad will remain active.",
      "Dismiss Report",
      false
    );
    if (!confirmed) return;

    setAdActionLoading(`dismiss-${reportId}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss_report",
          reportId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await alertDialog("Report dismissed successfully.", "Report Dismissed");
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      await alertDialog("Failed to dismiss report: " + e.message, "Error");
    } finally {
      setAdActionLoading(null);
    }
  };

  const fetchDlqJobs = useCallback(async () => {
    try {
      setDlqLoading(true);
      const res = await fetch("/api/admin/queues");
      if (res.ok) {
        const data = await res.json();
        setDlqJobs(data.jobs || []);
        setDlqCount(data.count || 0);
      }
    } catch (err: any) {
      console.error("Error fetching DLQ jobs:", err);
    } finally {
      setDlqLoading(false);
    }
  }, [setDlqCount, setDlqJobs, setDlqLoading]);

  const handleRetryDlqAll = async () => {
    setDlqActionStatus("Retrying all failed jobs...");
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_all" }),
      });
      if (res.ok) {
        const data = await res.json();
        setDlqActionStatus(`Successfully re-queued ${data.retriedCount || 0} failed jobs!`);
        fetchDlqJobs();
      }
    } catch (err: any) {
      setDlqActionStatus(`Retry failed: ${err.message}`);
    }
  };

  const handleRetryDlqSingle = async (jobId: string) => {
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_job", jobId }),
      });
      if (res.ok) {
        fetchDlqJobs();
      }
    } catch (err: any) {
      console.error("Single job retry failed:", err);
    }
  };

  const handleClearDlqAll = async () => {
    const confirmed = await confirmDialog(
      "Are you sure you want to clear all DLQ records?",
      "Clear Dead-Letter Queue",
      true
    );
    if (!confirmed) return;
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all" }),
      });
      if (res.ok) {
        fetchDlqJobs();
      }
    } catch (err: any) {
      console.error("Clear DLQ failed:", err);
    }
  };

  return {
    fetchReportedAds,
    handleInspectAd,
    handleDeactivateReportedAd,
    handleBlockReportedAdvertiser,
    handleDismissReport,
    fetchDlqJobs,
    handleRetryDlqAll,
    handleRetryDlqSingle,
    handleClearDlqAll,
  };
}

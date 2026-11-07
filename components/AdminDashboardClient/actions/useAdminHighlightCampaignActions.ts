"use client";

import React from "react";
import supabase from "@/lib/utils/db";
import { v4 as uuidv4 } from "uuid";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import type { AdminTab } from "../AdminLayoutAndCampaignTabs";

export interface AdminHighlightCampaignParams {
  campaignActionLoading: string | null;
  setCampaignActionLoading: (v: string | null) => void;
  editHighlightData: any;
  setEditHighlightData: (d: any) => void;
  setPendingHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  highlightForm: any;
  setHighlightForm: React.Dispatch<React.SetStateAction<any>>;
  highlightFormFile: File | null;
  setHighlightFormFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUploading: (u: boolean) => void;
  handleRefresh: () => void;
  fetchOverviewStats: (fresh?: boolean) => void;
  handleTabChange: (tab: AdminTab) => void;
  alertDialog: (message: string, title?: string) => Promise<boolean | void>;
  confirmDialog: (message: string, title?: string, isDestructive?: boolean) => Promise<boolean>;
}

export function useAdminHighlightCampaignActions(params: AdminHighlightCampaignParams) {
  const {
    campaignActionLoading,
    setCampaignActionLoading,
    editHighlightData,
    setEditHighlightData,
    setPendingHighlights,
    setActiveHighlights,
    setPendingHighlightsCount,
    setActiveHighlightsCount,
    highlightForm,
    setHighlightForm,
    highlightFormFile,
    setHighlightFormFile,
    setUploading,
    handleRefresh,
    fetchOverviewStats,
    handleTabChange,
    alertDialog,
    confirmDialog,
  } = params;

  const handleApproveHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to APPROVE this Highlight ("${highlight.title || highlight.id}")? It will go live immediately.`,
      "Approve Highlight",
      false
    );
    if (!confirmed) return;

    setCampaignActionLoading(`approve-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_highlight", id: highlight.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setPendingHighlights((prev) =>
        prev.map((h) =>
          h.id === highlight.id ? { ...h, admin_statement: `APPROVED:${new Date().toISOString()}` } : h
        )
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error approving highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const feedback = prompt(
      "Enter a reason or feedback for rejecting this Highlight (visible to the user to adjust):"
    );
    if (feedback === null) return;

    const confirmed = await confirmDialog(
      `Are you sure you want to REJECT this Highlight?\n\nReason to user: "${feedback}"`,
      "Reject Highlight",
      true
    );
    if (!confirmed) return;

    setCampaignActionLoading(`reject-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_highlight",
          id: highlight.id,
          payload: { statement: feedback, reason: feedback },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      setPendingHighlights((prev) =>
        prev.map((h) => (h.id === highlight.id ? { ...h, admin_statement: `REJECTED:${feedback}` } : h))
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error rejecting highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const targetState = !highlight.is_paused;
    const confirmed = await confirmDialog(
      `Are you sure you want to ${targetState ? "PAUSE" : "RESUME"} this Highlight?`,
      targetState ? "Pause Highlight" : "Resume Highlight",
      targetState
    );
    if (!confirmed) return;

    setCampaignActionLoading(`pause-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_highlight" : "resume_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");

      const nextStatement = targetState ? (highlight.admin_statement || null) : null;
      setActiveHighlights((prev) =>
        prev.map((h) =>
          h.id === highlight.id
            ? { ...h, is_paused: targetState, admin_statement: nextStatement }
            : h
        )
      );
      setPendingHighlights((prev) =>
        prev.map((h) =>
          h.id === highlight.id
            ? { ...h, is_paused: targetState, admin_statement: nextStatement }
            : h
        )
      );

      await alertDialog(`Highlight successfully ${targetState ? "paused" : "resumed"}!`, "Highlight Updated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error updating highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveHighlightEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHighlightData || !editHighlightData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-hl-${editHighlightData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_highlight_edit",
          id: editHighlightData.id,
          payload: editHighlightData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update highlight");

      await alertDialog("Highlight details updated successfully!", "Highlight Saved");
      setEditHighlightData(null);
      handleRefresh();
    } catch (e: any) {
      await alertDialog(`Error saving highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog("Are you sure you want to PERMANENTLY delete this highlight?", "Delete Highlight", true);
    if (!confirmed) {
      return;
    }

    setCampaignActionLoading(`delete-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete highlight");

      setPendingHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      setActiveHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      setPendingHighlightsCount((c) => Math.max(0, c - 1));
      setActiveHighlightsCount((c) => Math.max(0, c - 1));

      await alertDialog("Highlight deleted permanently.", "Highlight Deleted");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deleting highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handlePostHighlightDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!highlightFormFile) {
      alert("Please select a cover image file to upload.");
      return;
    }

    setUploading(true);
    const highlightId = uuidv4();

    try {
      const rawFile = highlightFormFile;
      const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
      const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
      const uniqueFileName = `${highlightId}_${sanitizedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(uniqueFileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("news")
        .getPublicUrl(uniqueFileName);

      const mediaUrl = publicUrlData?.publicUrl || "";

      const newHighlight = {
        id: highlightId,
        title: highlightForm.title,
        content: highlightForm.content,
        image_url: mediaUrl,
        interest: highlightForm.interest,
        user_email: highlightForm.userEmail.toLowerCase().trim(),
      };

      const response = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_highlight", payload: newHighlight }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Highlight posting failed: ${errorData.error || "Server error"}`);
      } else {
        alert("Business highlight published directly to active feed!");
        setHighlightForm({
          title: "",
          content: "",
          interest: "Business",
          userEmail: "admin@paayh.com",
        });
        setHighlightFormFile(null);
        handleTabChange("active-highlights");
      }
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  return {
    handleApproveHighlight,
    handleRejectHighlight,
    handleTogglePauseHighlight,
    handleSaveHighlightEdit,
    handleDeleteHighlight,
    handlePostHighlightDirect,
  };
}

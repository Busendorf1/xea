"use client";

import React from "react";
import supabase from "@/lib/utils/db";
import { v4 as uuidv4 } from "uuid";
import { adminDirectAdSchema } from "@/lib/validationSchemas";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export function useAdminCampaignAndUserActions(params: {
  userActionSubmitting: boolean;
  setUserActionSubmitting: (v: boolean) => void;
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  campaignActionLoading: string | null;
  setCampaignActionLoading: (v: string | null) => void;
  editAdData: any;
  setEditAdData: (d: any) => void;
  editHighlightData: any;
  setEditHighlightData: (d: any) => void;
  setPendingAds: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveAds: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingAdsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveAdsCount: React.Dispatch<React.SetStateAction<number>>;
  setPendingHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  adForm: any;
  setAdForm: React.Dispatch<React.SetStateAction<any>>;
  adFormFiles: File[];
  setAdFormFiles: React.Dispatch<React.SetStateAction<File[]>>;
  highlightForm: any;
  setHighlightForm: React.Dispatch<React.SetStateAction<any>>;
  highlightFormFile: File | null;
  setHighlightFormFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUploading: (u: boolean) => void;
  handleRefresh: () => void;
  fetchOverviewStats: (fresh?: boolean) => void;
  handleTabChange: (tab: AdminTab) => void;
}) {
  const {
    userActionSubmitting,
    setUserActionSubmitting,
    selectedUser,
    setSelectedUser,
    campaignActionLoading,
    setCampaignActionLoading,
    editAdData,
    setEditAdData,
    editHighlightData,
    setEditHighlightData,
    setPendingAds,
    setActiveAds,
    setPendingAdsCount,
    setActiveAdsCount,
    setPendingHighlights,
    setActiveHighlights,
    setPendingHighlightsCount,
    setActiveHighlightsCount,
    adForm,
    setAdForm,
    adFormFiles,
    setAdFormFiles,
    highlightForm,
    setHighlightForm,
    highlightFormFile,
    setHighlightFormFile,
    setUploading,
    handleRefresh,
    fetchOverviewStats,
    handleTabChange,
  } = params;

  const handleToggleMonetization = async (user: any) => {
    if (userActionSubmitting) return;
    setUserActionSubmitting(true);
    const isCurrentlyMonetized = user.monetized === "yes" || user.monetized === true;
    const nextMonetizedVal = isCurrentlyMonetized ? "no" : "yes";
    const nextMonetizedType = null;
    const nextMonetizedUntil = null;

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_monetization",
          userId: user.id,
          payload: {
            nextMonetizedVal,
            nextMonetizedType,
            nextMonetizedUntil,
            isCurrentlyMonetized,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to update monetization: ${err.error || "Server error"}`);
      } else {
        alert(
          `Successfully ${isCurrentlyMonetized ? "deactivated" : "activated"} monetization for @${user.username}`
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({
            ...selectedUser,
            monetized: nextMonetizedVal,
            monetization_type: nextMonetizedType,
            monetized_until: nextMonetizedUntil,
            monetized_at: isCurrentlyMonetized ? null : new Date().toISOString(),
          });
        }
      }
    } catch (e: any) {
      alert(`Error updating monetization: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleSuspendUser = async (user: any, hours: number) => {
    if (userActionSubmitting) return;
    setUserActionSubmitting(true);
    let suspendedUntil: string | null = null;
    if (hours > 0) {
      suspendedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    } else if (hours === -1) {
      suspendedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suspend",
          userId: user.id,
          payload: { suspendedUntil },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to suspend account: ${err.error || "Server error"}`);
      } else {
        const desc = hours === -1 ? "permanently" : hours === 0 ? "unsuspended" : `for ${hours} hours`;
        alert(`Successfully ${desc} user @${user.username}`);
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, suspended_until: suspendedUntil });
        }
      }
    } catch (e: any) {
      alert(`Error setting suspension: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleAdjustBalance = async (user: any, amount: number) => {
    if (isNaN(amount) || amount === 0 || userActionSubmitting) return;
    const reason = prompt(
      `Reason for adjusting balance for @${user.username} by ${formatCurrency(amount)}:`,
      "Administrative balance adjustment"
    );
    if (reason === null) return;

    setUserActionSubmitting(true);
    const newBalance = Math.max(0, parseFloat(user.balance || 0) + amount);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_balance",
          userId: user.id,
          payload: { newBalance, reason: reason.trim() },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to update balance: ${err.error || "Server error"}`);
      } else {
        alert(
          `Wallet balance adjusted by ${formatCurrency(amount)}. New Balance: ${formatCurrency(newBalance)}`
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, balance: newBalance });
        }
      }
    } catch (e: any) {
      alert(`Error adjusting wallet: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (userActionSubmitting) return;
    if (!confirm(`WARNING: Are you sure you want to delete @${user.username} (${user.email}) permanently?`)) {
      return;
    }

    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          userId: user.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to delete account: ${err.error || "Server error"}`);
      } else {
        alert(`Account for @${user.username} deleted permanently.`);
        setSelectedUser(null);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error deleting user: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleApproveAd = async (ad: any) => {
    if (campaignActionLoading) return;
    setCampaignActionLoading(`approve-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setPendingAds((prev) =>
        prev.map((a) =>
          a.id === ad.id ? { ...a, admin_statement: `APPROVED:${new Date().toISOString()}` } : a
        )
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error approving ad: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const feedback = prompt(
      "Enter a reason or feedback for rejecting this Ad (the advertiser will see this to adjust their campaign):"
    );
    if (feedback === null) return;

    setCampaignActionLoading(`reject-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_ad",
          id: ad.id,
          payload: { statement: feedback, reason: feedback },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      setPendingAds((prev) =>
        prev.map((a) => (a.id === ad.id ? { ...a, admin_statement: `REJECTED:${feedback}` } : a))
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error rejecting campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const targetState = !ad.is_paused;
    let statement: string | null = null;
    if (targetState) {
      statement = prompt("Enter a reason or statement for pausing this ad campaign (visible to the advertiser):");
      if (statement === null) return;
    }

    setCampaignActionLoading(`pause-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_ad" : "resume_ad",
          id: ad.id,
          payload: { statement },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      alert(`Ad campaign successfully ${targetState ? "paused" : "resumed"}!`);
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error pausing/resuming campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeactivateAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const reason = prompt(
      "Enter a reason or statement for deactivating this ad campaign (visible to the advertiser):"
    );
    if (reason === null) return;

    setCampaignActionLoading(`deactivate-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_ad",
          id: ad.id,
          payload: { statement: reason },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deactivation failed");

      alert("Ad campaign deactivated successfully!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deactivating campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveAdEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdData || !editAdData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-ad-${editAdData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_ad_edit",
          id: editAdData.id,
          payload: editAdData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      alert("Ad campaign details updated successfully!");
      setEditAdData(null);
      handleRefresh();
    } catch (e: any) {
      alert(`Error updating campaign details: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteAd = async (ad: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to PERMANENTLY delete this Ad?")) {
      return;
    }

    setCampaignActionLoading(`delete-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      setPendingAds((prev) => prev.filter((a) => a.id !== ad.id));
      setActiveAds((prev) => prev.filter((a) => a.id !== ad.id));
      setPendingAdsCount((c) => Math.max(0, c - 1));
      setActiveAdsCount((c) => Math.max(0, c - 1));

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deleting ad: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleApproveHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
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
      alert(`Error approving highlight: ${e.message}`);
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
      alert(`Error rejecting highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const targetState = !highlight.is_paused;
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

      alert(`Highlight successfully ${targetState ? "paused" : "resumed"}!`);
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error updating highlight: ${e.message}`);
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

      alert("Highlight details updated successfully!");
      setEditHighlightData(null);
      handleRefresh();
    } catch (e: any) {
      alert(`Error saving highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to PERMANENTLY delete this highlight?")) {
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

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deleting highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handlePostAdDirect = async (e: React.FormEvent) => {
    e.preventDefault();

    const adValidation = adminDirectAdSchema.safeParse({
      headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
      content: adForm.adContent || "Admin direct ad content",
      ctaLink: adForm.actionWebsite || "https://xea.app",
      impressions: adForm.impressions,
      campaignDays: adForm.campaignDays,
      userEmail: adForm.userEmail,
    });

    if (!adValidation.success) {
      alert(adValidation.error.issues[0]?.message || "Invalid ad form submission.");
      return;
    }

    if (adForm.adMediaType !== "text" && adFormFiles.length === 0) {
      alert("Please select at least one media file to upload.");
      return;
    }

    setUploading(true);
    const adId = uuidv4();
    const costPerImpression = 0;
    const totalCost = 0;

    try {
      let mediaUrlString: string | null = null;

      if (adFormFiles.length > 0) {
        const mediaUrls: string[] = [];
        for (let i = 0; i < adFormFiles.length; i++) {
          const rawFile = adFormFiles[i];
          const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
          const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from("ad-media")
            .getPublicUrl(uniqueFileName);

          if (publicUrlData?.publicUrl) {
            mediaUrls.push(publicUrlData.publicUrl);
          }
        }
        mediaUrlString = JSON.stringify(mediaUrls);
      }

      const adPayload = {
        id: adId,
        user_email: adForm.userEmail.toLowerCase().trim(),
        headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
        content: adForm.adContent,
        cta_link: adForm.actionWebsite || "https://xea.app",
        cta_button_text: "Learn More",
        ad_type: adForm.adType,
        ad_media_type: adForm.adMediaType,
        media_url: mediaUrlString,
        impressions: adForm.impressions,
        impressions_remaining: adForm.impressions,
        campaign_days: adForm.campaignDays,
        daily_impression_cap: Math.ceil(adForm.impressions / adForm.campaignDays),
        daily_impression_count: 0,
        user_frequency_cap: adForm.userFrequencyCap,
        ad_media: mediaUrlString,
        ad_action_buttons: [
          adForm.actionPhone && "phone",
          adForm.actionWhatsapp && "whatsapp",
          adForm.actionWebsite && "website",
          adForm.actionEmail && "email",
        ].filter(Boolean) as string[],
        action_phone: adForm.actionPhone || null,
        action_whatsapp: adForm.actionWhatsapp || null,
        action_website: adForm.actionWebsite || null,
        action_email: adForm.actionEmail || null,
        cost_per_impression: costPerImpression,
        total_cost: totalCost,
        impression_count: 0,
        seen_users: [],
      };

      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_ad", payload: adPayload }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to publish ad directly");
      }

      alert("Ad published directly to active feed!");
      setAdForm({
        adType: "business",
        industry: [],
        interest: [],
        impressions: 1000,
        campaignDays: 5,
        userFrequencyCap: 1,
        country: "Nigeria",
        state: "",
        gender: "both",
        employmentStatus: "employed",
        adMediaType: "text",
        adContent: "",
        actionPhone: "",
        actionWhatsapp: "",
        actionWebsite: "",
        actionEmail: "",
        costPerImpression: 25,
        userEmail: "admin@paayh.com",
      });
      setAdFormFiles([]);
      handleTabChange("active-ads");
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
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

  const toggleIndustryFormSelection = (item: string) => {
    setAdForm((prev: any) => {
      const list = prev.industry;
      const updated = list.includes(item) ? list.filter((v: string) => v !== item) : [...list, item];
      return { ...prev, industry: updated };
    });
  };

  const toggleInterestFormSelection = (item: string) => {
    setAdForm((prev: any) => {
      const list = prev.interest;
      const updated = list.includes(item) ? list.filter((v: string) => v !== item) : [...list, item];
      return { ...prev, interest: updated };
    });
  };

  return {
    handleToggleMonetization,
    handleSuspendUser,
    handleAdjustBalance,
    handleDeleteUser,
    handleApproveAd,
    handleRejectAd,
    handleTogglePauseAd,
    handleDeactivateAd,
    handleSaveAdEdit,
    handleDeleteAd,
    handleApproveHighlight,
    handleRejectHighlight,
    handleTogglePauseHighlight,
    handleSaveHighlightEdit,
    handleDeleteHighlight,
    handlePostAdDirect,
    handlePostHighlightDirect,
    toggleIndustryFormSelection,
    toggleInterestFormSelection,
  };
}

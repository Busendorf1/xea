"use client";

import React from "react";
import supabase from "@/lib/utils/db";
import { v4 as uuidv4 } from "uuid";
import { adminDirectAdSchema } from "@/lib/validationSchemas";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import type { AdminTab } from "../AdminLayoutAndCampaignTabs";

export interface AdminAdCampaignParams {
  campaignActionLoading: string | null;
  setCampaignActionLoading: (v: string | null) => void;
  editAdData: any;
  setEditAdData: (d: any) => void;
  setPendingAds: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveAds: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingAdsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveAdsCount: React.Dispatch<React.SetStateAction<number>>;
  adForm: any;
  setAdForm: React.Dispatch<React.SetStateAction<any>>;
  adFormFiles: File[];
  setAdFormFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setUploading: (u: boolean) => void;
  handleRefresh: () => void;
  fetchOverviewStats: (fresh?: boolean) => void;
  handleTabChange: (tab: AdminTab) => void;
  alertDialog: (message: string, title?: string) => Promise<boolean | void>;
  confirmDialog: (message: string, title?: string, isDestructive?: boolean) => Promise<boolean>;
}

export function useAdminAdCampaignActions(params: AdminAdCampaignParams) {
  const {
    campaignActionLoading,
    setCampaignActionLoading,
    editAdData,
    setEditAdData,
    setPendingAds,
    setActiveAds,
    setPendingAdsCount,
    setActiveAdsCount,
    adForm,
    setAdForm,
    adFormFiles,
    setAdFormFiles,
    setUploading,
    handleRefresh,
    fetchOverviewStats,
    handleTabChange,
    alertDialog,
    confirmDialog,
  } = params;

  const handleApproveAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to APPROVE this Ad campaign ("${ad.headline || ad.ad_content?.slice(0, 40) || ad.id}")? It will go live immediately.`,
      "Approve Ad Campaign",
      false
    );
    if (!confirmed) return;

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
      await alertDialog(`Error approving ad: ${e.message}`, "Error");
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

    const confirmed = await confirmDialog(
      `Are you sure you want to REJECT this Ad campaign?\n\nReason to advertiser: "${feedback}"`,
      "Reject Ad Campaign",
      true
    );
    if (!confirmed) return;

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
      await alertDialog(`Error rejecting campaign: ${e.message}`, "Error");
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

    const confirmed = await confirmDialog(
      `Are you sure you want to ${targetState ? "PAUSE" : "RESUME"} this Ad campaign?`,
      targetState ? "Pause Campaign" : "Resume Campaign",
      targetState
    );
    if (!confirmed) return;

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

      await alertDialog(`Ad campaign successfully ${targetState ? "paused" : "resumed"}!`, "Campaign Updated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error pausing/resuming campaign: ${e.message}`, "Error");
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

    const confirmed = await confirmDialog(
      `Are you sure you want to DEACTIVATE this Ad campaign? It will be stopped permanently.\n\nReason: "${reason}"`,
      "Deactivate Campaign",
      true
    );
    if (!confirmed) return;

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

      await alertDialog("Ad campaign deactivated successfully!", "Campaign Deactivated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deactivating campaign: ${e.message}`, "Error");
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

      await alertDialog("Ad campaign details updated successfully!", "Campaign Saved");
      setEditAdData(null);
      handleRefresh();
    } catch (e: any) {
      await alertDialog(`Error updating campaign details: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog("Are you sure you want to PERMANENTLY delete this Ad?", "Delete Ad Campaign", true);
    if (!confirmed) {
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

      await alertDialog("Ad campaign deleted permanently.", "Ad Deleted");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deleting ad: ${e.message}`, "Error");
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
    handleApproveAd,
    handleRejectAd,
    handleTogglePauseAd,
    handleDeactivateAd,
    handleSaveAdEdit,
    handleDeleteAd,
    handlePostAdDirect,
    toggleIndustryFormSelection,
    toggleInterestFormSelection,
  };
}

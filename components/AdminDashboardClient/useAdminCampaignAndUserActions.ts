"use client";

import React from "react";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import { useAdminUserManagementActions } from "./actions/useAdminUserManagementActions";
import { useAdminUserNetworkActions } from "./actions/useAdminUserNetworkActions";
import { useAdminAdCampaignActions } from "./actions/useAdminAdCampaignActions";
import { useAdminHighlightCampaignActions } from "./actions/useAdminHighlightCampaignActions";

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
  const { alertDialog, confirmDialog } = useAdminDialog();
  const [activeActionId, setActiveActionId] = React.useState<string | null>(null);

  const userManagement = useAdminUserManagementActions({
    userActionSubmitting: params.userActionSubmitting,
    setUserActionSubmitting: params.setUserActionSubmitting,
    selectedUser: params.selectedUser,
    setSelectedUser: params.setSelectedUser,
    setActiveActionId,
    handleRefresh: params.handleRefresh,
    alertDialog,
    confirmDialog,
  });

  const userNetwork = useAdminUserNetworkActions({
    userActionSubmitting: params.userActionSubmitting,
    setUserActionSubmitting: params.setUserActionSubmitting,
    selectedUser: params.selectedUser,
    setSelectedUser: params.setSelectedUser,
    setActiveActionId,
    handleRefresh: params.handleRefresh,
    alertDialog,
    confirmDialog,
  });

  const adCampaign = useAdminAdCampaignActions({
    campaignActionLoading: params.campaignActionLoading,
    setCampaignActionLoading: params.setCampaignActionLoading,
    editAdData: params.editAdData,
    setEditAdData: params.setEditAdData,
    setPendingAds: params.setPendingAds,
    setActiveAds: params.setActiveAds,
    setPendingAdsCount: params.setPendingAdsCount,
    setActiveAdsCount: params.setActiveAdsCount,
    adForm: params.adForm,
    setAdForm: params.setAdForm,
    adFormFiles: params.adFormFiles,
    setAdFormFiles: params.setAdFormFiles,
    setUploading: params.setUploading,
    handleRefresh: params.handleRefresh,
    fetchOverviewStats: params.fetchOverviewStats,
    handleTabChange: params.handleTabChange,
    alertDialog,
    confirmDialog,
  });

  const highlightCampaign = useAdminHighlightCampaignActions({
    campaignActionLoading: params.campaignActionLoading,
    setCampaignActionLoading: params.setCampaignActionLoading,
    editHighlightData: params.editHighlightData,
    setEditHighlightData: params.setEditHighlightData,
    setPendingHighlights: params.setPendingHighlights,
    setActiveHighlights: params.setActiveHighlights,
    setPendingHighlightsCount: params.setPendingHighlightsCount,
    setActiveHighlightsCount: params.setActiveHighlightsCount,
    highlightForm: params.highlightForm,
    setHighlightForm: params.setHighlightForm,
    highlightFormFile: params.highlightFormFile,
    setHighlightFormFile: params.setHighlightFormFile,
    setUploading: params.setUploading,
    handleRefresh: params.handleRefresh,
    fetchOverviewStats: params.fetchOverviewStats,
    handleTabChange: params.handleTabChange,
    alertDialog,
    confirmDialog,
  });

  return {
    activeActionId,
    ...userManagement,
    ...userNetwork,
    ...adCampaign,
    ...highlightCampaign,
  };
}

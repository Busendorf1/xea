"use client";

import React from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import AdminAgentsNetworkTab from "./AdminAgentsNetworkTab";
import { AdminDashboardModals } from "./AdminDashboardModals";
import { AdminAdCard, AdminHighlightCard } from "./AdminCampaignCards";
import { AdminAccountsTab, AdminHelpCenterTab, AdminReportedAdsTab } from "./AdminCoreTabs";
import {
  AdminHeader,
  AdminSidebar,
  AdminCampaignQueueOrActiveSection,
} from "./AdminLayoutAndCampaignTabs";
import { AdminPagination } from "./AdminPagination";
import { useAdminDashboardState } from "./useAdminDashboardState";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const AdminPayoutsTab = dynamic(() => import("./AdminPayoutsTab"), { ssr: false });
const AdminMasterStatementTab = dynamic(() => import("./AdminMasterStatementTab"), { ssr: false });
const AdminReconciliationTab = dynamic(() => import("./AdminReconciliationTab"), { ssr: false });
const AdminOverviewTab = dynamic(() => import("./AdminOverviewTab"), { ssr: false });
const AdminDirectPostTab = dynamic(() => import("./AdminDirectPostTab"), { ssr: false });
const AdminSendNotificationsTab = dynamic(() => import("./AdminSendNotificationsTab"), { ssr: false });
const AdminQueuesTab = dynamic(() => import("./AdminQueuesTab"), { ssr: false });
const AdminBrandSubscribersTab = dynamic(() => import("./AdminBrandSubscribersTab"), { ssr: false });

interface AdminDashboardClientProps {
  session: {
    user?: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  };
  adminEmails: string[];
}

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export default function AdminDashboardClient({ session }: AdminDashboardClientProps) {
  const s = useAdminDashboardState();

  const renderPagination = (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit: number = 10,
    setLimit?: (l: number) => void
  ) => (
    <AdminPagination
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      totalCount={totalCount}
      limit={limit}
      setLimit={setLimit}
    />
  );

  const renderAdminAdCard = (ad: any, isQueue = false) => (
    <AdminAdCard
      key={ad.id}
      ad={ad}
      isQueue={isQueue}
      campaignActionLoading={s.campaignActionLoading}
      handleApproveAd={s.handleApproveAd}
      handleRejectAd={s.handleRejectAd}
      handleDeleteAd={s.handleDeleteAd}
      handleTogglePauseAd={s.handleTogglePauseAd}
      handleDeactivateAd={s.handleDeactivateAd}
      setEditAdData={s.setEditAdData}
    />
  );

  const renderAdminHighlightCard = (highlight: any, isQueue = false) => (
    <AdminHighlightCard
      key={highlight.id}
      highlight={highlight}
      isQueue={isQueue}
      campaignActionLoading={s.campaignActionLoading}
      handleApproveHighlight={s.handleApproveHighlight}
      handleRejectHighlight={s.handleRejectHighlight}
      handleDeleteHighlight={s.handleDeleteHighlight}
      handleTogglePauseHighlight={s.handleTogglePauseHighlight}
      setEditHighlightData={s.setEditHighlightData}
    />
  );

  return (
    <div className={styles.adminWrapper}>
      <AdminHeader
        email={session.user?.email}
        theme={s.theme}
        setTheme={s.setTheme}
        mounted={s.mounted}
      />

      <div className={styles.dashboardContent}>
        <AdminSidebar
          activeTab={s.activeTab}
          handleTabChange={s.handleTabChange}
          stats={s.stats}
          helpTicketsCount={s.helpTicketsCount}
          reportedAdsCount={s.reportedAdsCount}
          pendingSubscribersCount={s.pendingSubscribersCount}
          handleRefresh={s.handleRefresh}
          refreshing={s.refreshing}
          loading={s.loading}
        />

        {/* Main Content Area */}
        <main className={styles.mainPanel}>
          {s.activeTab === "overview" && (
            <AdminOverviewTab
              loading={s.loading}
              stats={s.stats}
              showAdminBalance={s.showAdminBalance}
              toggleAdminBalance={s.toggleAdminBalance}
              formatCurrency={formatCurrency}
            />
          )}

          {s.activeTab === "accounts" && (
            <AdminAccountsTab
              loading={s.loading}
              users={s.users}
              usersPage={s.usersPage}
              setUsersPage={s.setUsersPage}
              usersCount={s.usersCount}
              usersLimit={s.usersLimit}
              setUsersLimit={s.setUsersLimit}
              searchQuery={s.searchQuery}
              setSearchQuery={s.setSearchQuery}
              renderPagination={renderPagination}
              setSelectedUser={s.setSelectedUser}
              handleToggleMonetization={s.handleToggleMonetization}
              handleToggleAgent={s.handleToggleAgent}
              userActionSubmitting={s.userActionSubmitting}
              activeActionId={s.activeActionId}
              usersFilter={s.usersFilter}
              setUsersFilter={s.setUsersFilter}
              setBanModalUser={s.setBanModalUser}
              setBanModalStatus={s.setBanModalStatus}
              setBanModalReason={s.setBanModalReason}
            />
          )}

          {s.activeTab === "agents-network" && (
            <AdminAgentsNetworkTab
              setSelectedUser={s.setSelectedUser}
              handleToggleAgent={s.handleToggleAgent}
              handleBanAgent={s.handleBanAgent}
              handleRemoveFollower={s.handleRemoveFollower}
              handleRemoveAllFollowers={s.handleRemoveAllFollowers}
              handleUpdateSpecialRoles={s.handleUpdateSpecialRoles}
              userActionSubmitting={s.userActionSubmitting}
              activeActionId={s.activeActionId}
            />
          )}

          {(s.activeTab === "ad-approvals" ||
            s.activeTab === "highlight-approvals" ||
            s.activeTab === "active-ads" ||
            s.activeTab === "active-highlights") && (
            <AdminCampaignQueueOrActiveSection
              mode={s.activeTab}
              loading={s.loading}
              items={
                s.activeTab === "ad-approvals"
                  ? s.pendingAds
                  : s.activeTab === "highlight-approvals"
                  ? s.pendingHighlights
                  : s.activeTab === "active-ads"
                  ? s.activeAds
                  : s.activeHighlights
              }
              count={
                s.activeTab === "ad-approvals"
                  ? s.pendingAdsCount
                  : s.activeTab === "highlight-approvals"
                  ? s.pendingHighlightsCount
                  : s.activeTab === "active-ads"
                  ? s.activeAdsCount
                  : s.activeHighlightsCount
              }
              page={
                s.activeTab === "ad-approvals"
                  ? s.pendingAdsPage
                  : s.activeTab === "highlight-approvals"
                  ? s.pendingHighlightsPage
                  : s.activeTab === "active-ads"
                  ? s.activeAdsPage
                  : s.activeHighlightsPage
              }
              setPage={
                s.activeTab === "ad-approvals"
                  ? s.setPendingAdsPage
                  : s.activeTab === "highlight-approvals"
                  ? s.setPendingHighlightsPage
                  : s.activeTab === "active-ads"
                  ? s.setActiveAdsPage
                  : s.setActiveHighlightsPage
              }
              searchQuery={s.searchQuery}
              setSearchQuery={s.setSearchQuery}
              renderCard={
                s.activeTab === "ad-approvals" || s.activeTab === "active-ads"
                  ? renderAdminAdCard
                  : renderAdminHighlightCard
              }
              renderPagination={renderPagination}
            />
          )}

          {s.activeTab === "direct-post" && (
            <AdminDirectPostTab
              adForm={s.adForm}
              setAdForm={s.setAdForm}
              adFormFiles={s.adFormFiles}
              setAdFormFiles={s.setAdFormFiles}
              highlightForm={s.highlightForm}
              setHighlightForm={s.setHighlightForm}
              highlightFormFile={s.highlightFormFile}
              setHighlightFormFile={s.setHighlightFormFile}
              industriesList={s.industriesList}
              interestsList={s.interestsList}
              toggleIndustryFormSelection={s.toggleIndustryFormSelection}
              toggleInterestFormSelection={s.toggleInterestFormSelection}
              handlePostAdDirect={s.handlePostAdDirect}
              handlePostHighlightDirect={s.handlePostHighlightDirect}
              uploading={s.uploading}
            />
          )}

          {s.activeTab === "help-center" && (
            <AdminHelpCenterTab
              loading={s.loading}
              helpTickets={s.helpTickets}
              helpTicketsCount={s.helpTicketsCount}
              helpTicketsPage={s.helpTicketsPage}
              setHelpTicketsPage={s.setHelpTicketsPage}
              helpTicketSearch={s.helpTicketSearch}
              setHelpTicketSearch={s.setHelpTicketSearch}
              setReplyingTicket={s.setReplyingTicket}
              setReplyText={s.setReplyText}
              handleCloseTicket={s.handleCloseTicket}
              handleDeleteTicket={s.handleDeleteTicket}
            />
          )}

          {s.activeTab === "send-notifications" && (
            <AdminSendNotificationsTab
              notificationTarget={s.notificationTarget}
              setNotificationTarget={s.setNotificationTarget}
              notificationTargetEmail={s.notificationTargetEmail}
              setNotificationTargetEmail={s.setNotificationTargetEmail}
              notificationTitle={s.notificationTitle}
              setNotificationTitle={s.setNotificationTitle}
              notificationMessage={s.notificationMessage}
              setNotificationMessage={s.setNotificationMessage}
              notificationSuccessMsg={s.notificationSuccessMsg}
              notificationErrorMsg={s.notificationErrorMsg}
              notificationLoading={s.notificationLoading}
              handleSendNotification={s.handleSendNotification}
            />
          )}

          {s.activeTab === "reported-ads" && (
            <AdminReportedAdsTab
              loading={s.loading}
              reportedAds={s.reportedAds}
              reportedAdsCount={s.reportedAdsCount}
              reportedAdsPage={s.reportedAdsPage}
              setReportedAdsPage={s.setReportedAdsPage}
              reportedAdsSearch={s.reportedAdsSearch}
              setReportedAdsSearch={s.setReportedAdsSearch}
              adActionLoading={s.adActionLoading}
              handleInspectAd={s.handleInspectAd}
              handleDeactivateReportedAd={s.handleDeactivateReportedAd}
              handleBlockReportedAdvertiser={s.handleBlockReportedAdvertiser}
              handleDismissReport={s.handleDismissReport}
              renderPagination={renderPagination}
            />
          )}

          {s.activeTab === "queues" && (
            <AdminQueuesTab
              dlqJobs={s.dlqJobs}
              dlqCount={s.dlqCount}
              dlqLoading={s.dlqLoading}
              dlqActionStatus={s.dlqActionStatus}
              handleRetryDlqAll={s.handleRetryDlqAll}
              handleClearDlqAll={s.handleClearDlqAll}
              handleRetryDlqSingle={s.handleRetryDlqSingle}
            />
          )}

          {s.activeTab === "payout-management" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Payouts & Queue Manager</h1>
                <p className={styles.sectionSubtitle}>
                  Float monitoring, batch execution, and retry controls.
                </p>
              </div>
              <AdminPayoutsTab />
            </>
          )}

          {s.activeTab === "master-statement" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Platform Master Statement</h1>
                <p className={styles.sectionSubtitle}>
                  Platform transactions, ledger records, and statement export.
                </p>
              </div>
              <AdminMasterStatementTab />
            </>
          )}

          {s.activeTab === "reconciliation" && (
            <AdminReconciliationTab renderPagination={renderPagination} />
          )}

          {s.activeTab === "brand-subscribers" && (
            <AdminBrandSubscribersTab renderPagination={renderPagination} />
          )}
        </main>
      </div>

      <AdminDashboardModals
        selectedUser={s.selectedUser}
        setSelectedUser={s.setSelectedUser}
        userActionSubmitting={s.userActionSubmitting}
        activeActionId={s.activeActionId}
        handleAdjustBalance={s.handleAdjustBalance}
        handleSuspendUser={s.handleSuspendUser}
        handleDeleteUser={s.handleDeleteUser}
        handleToggleMonetization={s.handleToggleMonetization}
        handleUpdateUserProfile={s.handleUpdateUserProfile}
        handleUpdateSpecialRoles={s.handleUpdateSpecialRoles}
        handleToggleAgent={s.handleToggleAgent}
        handleBanAgent={s.handleBanAgent}
        handleRemoveFollower={s.handleRemoveFollower}
        handleRemoveAllFollowers={s.handleRemoveAllFollowers}
        handleDetachUplineAgent={s.handleDetachUplineAgent}
        handleDeactivateAccount={s.handleDeactivateAccount}
        handleResetClicks={s.handleResetClicks}
        editAdData={s.editAdData}
        setEditAdData={s.setEditAdData}
        handleSaveAdEdit={s.handleSaveAdEdit}
        editHighlightData={s.editHighlightData}
        setEditHighlightData={s.setEditHighlightData}
        handleSaveHighlightEdit={s.handleSaveHighlightEdit}
        interestsList={s.interestsList}
        replyingTicket={s.replyingTicket}
        setReplyingTicket={s.setReplyingTicket}
        replyText={s.replyText}
        setReplyText={s.setReplyText}
        replyLoading={s.replyLoading}
        handleReplyTicket={s.handleReplyTicket}
        inspectingAd={s.inspectingAd}
        setInspectingAd={s.setInspectingAd}
        handleDeactivateReportedAd={s.handleDeactivateReportedAd}
        banModalUser={s.banModalUser}
        setBanModalUser={s.setBanModalUser}
        banModalStatus={s.banModalStatus}
        setBanModalStatus={s.setBanModalStatus}
        banModalDays={s.banModalDays}
        setBanModalDays={s.setBanModalDays}
        banModalReason={s.banModalReason}
        setBanModalReason={s.setBanModalReason}
        banSubmitting={s.banSubmitting}
        handleExecuteAdBan={s.handleExecuteAdBan}
      />
    </div>
  );
}

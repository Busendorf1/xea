import { HighlightItem, getHighlightScheduleInfo } from "./types";

export type HighlightFilterTab = "all" | "active" | "pending" | "approved" | "paused";
export type HighlightSortOption = "newest" | "bid" | "duration";

export const HIGHLIGHTS_PER_PAGE = 10;

export function exportHighlightToCsv(item: HighlightItem, isInReview: boolean, timeNow: number) {
  const isBidded = !!item.is_bidded || Number(item.bid_price || 0) > 1000;
  const dailyRate = isBidded ? Number(item.bid_price || 1500) : 1000;
  const scheduleInfo = getHighlightScheduleInfo(item, timeNow);

  const headers = [
    "Highlight ID",
    "Created At",
    "Title",
    "Category",
    "Approval Status",
    "Delivery State",
    "Is Bidded",
    "Daily Rate",
    "Scheduled Days",
    "Scheduled Expiry",
    "Total Cost",
    "Country",
    "State",
    "Province",
    "Content Preview",
  ];

  const approvalStatus = isInReview ? "Pending Review" : "Approved";
  const deliveryState = isInReview
    ? "Pending"
    : item.is_paused
    ? "Paused"
    : scheduleInfo.isExpired
    ? "Completed"
    : "Active";

  const values = [
    `"${item.id}"`,
    `"${item.created_at || ""}"`,
    `"${(item.title || "").replace(/"/g, '""')}"`,
    `"${item.interest || "General"}"`,
    `"${approvalStatus}"`,
    `"${deliveryState}"`,
    `"${isBidded ? "Yes" : "No"}"`,
    dailyRate,
    scheduleInfo.scheduledDays,
    `"${scheduleInfo.expiresAtLabel || ""}"`,
    dailyRate * scheduleInfo.scheduledDays,
    `"${item.country || "All"}"`,
    `"${item.state || "All"}"`,
    `"${item.province || "All"}"`,
    `"${(item.content || "").replace(/"/g, '""')}"`,
  ];

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), values.join(",")].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `paayh_highlight_${item.id.slice(0, 8)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

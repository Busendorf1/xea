"use client";

import React from "react";
import {
  adminNotificationSchema,
  adminTicketReplySchema,
} from "@/lib/validationSchemas";
import { useAdminDialog } from "@/components/ui/AdminDialog";

interface UseAdminSupportAndNotificationsParams {
  setLoading: (l: boolean) => void;
  helpTickets: any[];
  setHelpTickets: React.Dispatch<React.SetStateAction<any[]>>;
  helpTicketsPage: number;
  helpTicketSearch: string;
  setHelpTicketsCount: (c: number) => void;
  replyText: string;
  setReplyText: (s: string) => void;
  setReplyingTicket: (t: any) => void;
  setReplyLoading: (l: boolean) => void;
  notificationTarget: "all" | "monetized" | "user";
  notificationTargetEmail: string;
  setNotificationTargetEmail: (s: string) => void;
  notificationTitle: string;
  setNotificationTitle: (s: string) => void;
  notificationMessage: string;
  setNotificationMessage: (s: string) => void;
  setNotificationLoading: (l: boolean) => void;
  setNotificationSuccessMsg: (s: string) => void;
  setNotificationErrorMsg: (s: string) => void;
}

export function useAdminSupportAndNotifications({
  setLoading,
  helpTickets,
  setHelpTickets,
  helpTicketsPage,
  helpTicketSearch,
  setHelpTicketsCount,
  replyText,
  setReplyText,
  setReplyingTicket,
  setReplyLoading,
  notificationTarget,
  notificationTargetEmail,
  setNotificationTargetEmail,
  notificationTitle,
  setNotificationTitle,
  notificationMessage,
  setNotificationMessage,
  setNotificationLoading,
  setNotificationSuccessMsg,
  setNotificationErrorMsg,
}: UseAdminSupportAndNotificationsParams) {
  const { alertDialog, confirmDialog } = useAdminDialog();

  const fetchHelpTickets = async (page: number, search: string, fresh = false) => {
    if (helpTickets.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/help-tickets?page=${page}&limit=10&search=${encodeURIComponent(search || "")}${
          fresh ? "&fresh=true" : ""
        }`
      );
      if (!res.ok) throw new Error("Failed to fetch help tickets");
      const json = await res.json();
      setHelpTickets(json.tickets || []);
      setHelpTicketsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching help tickets:", e);
      if (helpTickets.length === 0) {
        setHelpTickets([]);
        setHelpTicketsCount(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReplyTicket = async (ticketId: string) => {
    const validation = adminTicketReplySchema.safeParse({ ticketId, replyText });
    if (!validation.success) {
      await alertDialog(
        validation.error.issues[0]?.message || "Invalid ticket reply text.",
        "Validation Error"
      );
      return;
    }
    setReplyLoading(true);
    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", ticketId, replyText: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send reply");

      await alertDialog("Reply sent successfully!", "Support Reply Sent");
      setReplyingTicket(null);
      setReplyText("");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      await alertDialog("Failed to send reply: " + e.message, "Error");
    } finally {
      setReplyLoading(false);
    }
  };

  const handleCloseTicket = async (ticket: any) => {
    const ticketId = typeof ticket === "string" ? ticket : ticket.id;
    const confirmed = await confirmDialog(
      "Are you sure you want to mark this support ticket as CLOSED? The user will be notified and the ticket will auto-delete in 24 hours.",
      "Close Support Ticket",
      false
    );
    if (!confirmed) return;

    const now = new Date().toISOString();

    setHelpTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: "closed", resolved_at: now } : t))
    );

    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", ticketId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to close ticket");

      await alertDialog(
        "Ticket marked as CLOSED! Notification sent to user. Ticket will auto-delete in 24 hours.",
        "Ticket Closed"
      );
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      await alertDialog("Failed to close ticket: " + e.message, "Error");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    const confirmed = await confirmDialog(
      "Are you sure you want to PERMANENTLY delete this support ticket?",
      "Delete Support Ticket",
      true
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ticketId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to delete ticket");

      setHelpTickets((prev) => prev.filter((t) => t.id !== ticketId));
      await alertDialog("Ticket deleted successfully.", "Ticket Deleted");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      await alertDialog("Failed to delete ticket: " + e.message, "Error");
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotificationSuccessMsg("");
    setNotificationErrorMsg("");

    const validation = adminNotificationSchema.safeParse({
      title: notificationTitle,
      message: notificationMessage,
      target: notificationTarget,
      targetEmail: notificationTargetEmail,
    });

    if (!validation.success) {
      setNotificationErrorMsg(
        validation.error.issues[0]?.message || "Invalid notification input."
      );
      return;
    }

    setNotificationLoading(true);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: notificationTarget,
          title: notificationTitle,
          message: notificationMessage,
          targetEmail: notificationTarget === "user" ? notificationTargetEmail : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotificationSuccessMsg(`Broadcast sent successfully!`);
        setNotificationTitle("");
        setNotificationMessage("");
        setNotificationTargetEmail("");
      } else {
        setNotificationErrorMsg(data.error || "Failed to send notifications.");
      }
    } catch (err: any) {
      setNotificationErrorMsg(err.message || "Failed to send notifications.");
    } finally {
      setNotificationLoading(false);
    }
  };

  return {
    fetchHelpTickets,
    handleReplyTicket,
    handleCloseTicket,
    handleDeleteTicket,
    handleSendNotification,
  };
}

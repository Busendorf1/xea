"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, XCircle } from "lucide-react";
import { HighlightItem } from "./types";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./PublishHighlightPaymentModal.module.css";

interface PublishHighlightPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: HighlightItem | null;
  userBalance: number;
  onSuccess: (publishedHl: HighlightItem) => void;
}

export default function PublishHighlightPaymentModal({
  isOpen,
  onClose,
  item,
  userBalance,
  onSuccess,
}: PublishHighlightPaymentModalProps) {
  const [step, setStep] = useState<"options" | "confirm">("options");
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "card">("wallet");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const calculateCost = (hl: HighlightItem) => {
    const days = hl.campaign_days || 1;
    const rate = hl.is_bidded && hl.bid_price ? Number(hl.bid_price) : 1000;
    return rate * days;
  };

  useEffect(() => {
    if (isOpen && item) {
      setStep("options");
      setIsSubmitting(false);
      setErrorMsg(null);
      const cost = calculateCost(item);
      if (userBalance >= cost) {
        setPaymentMethod("wallet");
      } else {
        setPaymentMethod("card");
      }
    }
  }, [isOpen, item, userBalance]);

  if (!isOpen || !item) return null;

  const totalCost = calculateCost(item);
  const isFree = totalCost <= 0 || Boolean(item.is_admin_post);
  const hasInsufficientWallet = !isFree && paymentMethod === "wallet" && userBalance < totalCost;

  const handlePayClick = () => {
    if (isFree) {
      handlePublish();
      return;
    }
    if (hasInsufficientWallet) {
      setErrorMsg("Insufficient wallet balance. Please select Card / Bank Transfer to proceed.");
      return;
    }
    setErrorMsg(null);
    setStep("confirm");
  };

  const handlePublish = async () => {
    if (isSubmitting) return;

    if (!isFree && hasInsufficientWallet) {
      setErrorMsg("Insufficient wallet balance. Please choose Card / Bank Transfer to pay.");
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (isFree || paymentMethod === "wallet") {
        const res = await fetch("/api/payments/wallet-pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "publish_highlight",
            amount: isFree ? 0 : totalCost,
            metadata: {
              type: "publish_highlight",
              highlightId: item.id,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to publish highlight.");
        }

        try {
          sessionStorage.removeItem("paayh_statement_cache");
          window.dispatchEvent(new CustomEvent("paayh:balance_updated"));
        } catch {}

        onSuccess(data.highlight || item);
        onClose();
      } else {
        const res = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "publish_highlight",
            amount: totalCost,
            metadata: {
              type: "publish_highlight",
              highlightId: item.id,
              user_email: item.user_email,
            },
            callbackUrl: `${window.location.origin}/logged-in?view=myads&tab=highlights`,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to initialize payment gateway.");
        }

        const authUrl = data.authorization_url || data.data?.authorization_url;
        if (authUrl) {
          window.location.href = authUrl;
        } else {
          throw new Error("Missing gateway authorization URL.");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during publishing.");
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={styles.modalOverlay}
        onClick={isSubmitting ? undefined : onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={styles.noticeModal}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className={styles.modalHeader}>
            <div className={styles.modalHeaderLeft}>
              <Info size={22} color="var(--primary)" />
              <h3 className={styles.noticeModalTitle}>
                {isFree ? "Publish Highlight" : step === "options" ? "Publish Highlight" : "Confirm Payment"}
              </h3>
            </div>
            <button
              type="button"
              className={styles.modalClose}
              onClick={isSubmitting ? undefined : onClose}
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <XCircle size={24} />
            </button>
          </div>

          {/* Modal Body */}
          <div className={styles.noticeModalBody}>
            {isFree ? (
              <p className={styles.noticeModalBodyPara}>
                Your highlight has been reviewed and approved. Launch it directly into the live feed.
              </p>
            ) : step === "options" ? (
              <>
                <p className={styles.noticeModalBodyPara}>
                  Your highlight has been reviewed. Pay{" "}
                  <strong>{formatCurrency(totalCost, item.country)}</strong> to launch
                  it directly into the live feed.
                </p>

                <div className={styles.paymentOptions}>
                  <div
                    className={`${styles.paymentOptionCard} ${
                      paymentMethod === "wallet" ? styles.paymentOptionActive : ""
                    }`}
                    onClick={() => {
                      if (!isSubmitting) {
                        setPaymentMethod("wallet");
                        setErrorMsg(null);
                      }
                    }}
                  >
                    <div className={styles.optionLeft}>
                      <div
                        className={`${styles.radioCircle} ${
                          paymentMethod === "wallet" ? styles.radioCircleActive : ""
                        }`}
                      >
                        {paymentMethod === "wallet" && <div className={styles.radioDot} />}
                      </div>
                      <div className={styles.optionText}>
                        <span className={styles.optionTitle}>Wallet</span>
                        <span className={styles.optionSub}>
                          Available: {formatCurrency(userBalance, item.country)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`${styles.paymentOptionCard} ${
                      paymentMethod === "card" ? styles.paymentOptionActive : ""
                    }`}
                    onClick={() => {
                      if (!isSubmitting) {
                        setPaymentMethod("card");
                        setErrorMsg(null);
                      }
                    }}
                  >
                    <div className={styles.optionLeft}>
                      <div
                        className={`${styles.radioCircle} ${
                          paymentMethod === "card" ? styles.radioCircleActive : ""
                        }`}
                      >
                        {paymentMethod === "card" && <div className={styles.radioDot} />}
                      </div>
                      <div className={styles.optionText}>
                        <span className={styles.optionTitle}>Card / Bank Transfer</span>
                        <span className={styles.optionSub}>Debit card, bank transfer, USSD</span>
                      </div>
                    </div>
                  </div>
                </div>

                {hasInsufficientWallet && (
                  <div className={styles.insufficientWarning}>
                    Insufficient wallet balance. Please select Card / Bank Transfer to proceed.
                  </div>
                )}
              </>
            ) : (
              <>
                <p className={styles.noticeModalBodyPara}>
                  Payment is Non-refundable.
                </p>
                <p className={styles.noticeModalSubPara}>
                  Pay <strong>{formatCurrency(totalCost, item.country)}</strong> via{" "}
                  {paymentMethod === "wallet" ? "Wallet" : "Card / Bank Transfer"} to
                  launch directly into the live feed.
                </p>
              </>
            )}

            {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}
          </div>

          {/* Modal Footer */}
          <div className={styles.noticeModalFooter}>
            <div className={styles.modalActionBtns}>
              {isFree ? (
                <>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    className={styles.modalPrimaryBtn}
                    onClick={handlePublish}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="btnSpinner" aria-hidden="true" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      "Publish to Feed"
                    )}
                  </button>
                </>
              ) : step === "options" ? (
                <>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    className={styles.modalPrimaryBtn}
                    onClick={handlePayClick}
                    disabled={hasInsufficientWallet}
                  >
                    Pay
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={() => !isSubmitting && setStep("options")}
                    disabled={isSubmitting}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    className={styles.modalPrimaryBtn}
                    onClick={handlePublish}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="btnSpinner" aria-hidden="true" />
                        <span>Proceeding...</span>
                      </>
                    ) : (
                      "Proceed"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

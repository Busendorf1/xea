"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, XCircle } from "lucide-react";
import { Ad } from "./types";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./PublishAdPaymentModal.module.css";

interface PublishAdPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ad: Ad | null;
  userBalance: number;
  onSuccess: (publishedAd: Ad) => void;
}

export default function PublishAdPaymentModal({
  isOpen,
  onClose,
  ad,
  userBalance,
  onSuccess,
}: PublishAdPaymentModalProps) {
  const [step, setStep] = useState<"options" | "confirm">("options");
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "card">("wallet");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("options");
      setIsSubmitting(false);
      setErrorMsg(null);
      const costVal = Number(ad?.total_cost || (ad as any)?.cost || 0);
      if (ad && userBalance >= costVal) {
        setPaymentMethod("wallet");
      } else {
        setPaymentMethod("card");
      }
    }
  }, [isOpen, ad, userBalance]);

  if (!isOpen || !ad) return null;

  const totalCost = Number(ad.total_cost || (ad as any).cost || 0);
  const isFree = totalCost <= 0 || Boolean(ad.is_admin_post);
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
            type: "publish_ad",
            amount: isFree ? 0 : totalCost,
            metadata: {
              type: "publish_ad",
              adId: ad.id,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to publish campaign.");
        }

        try {
          sessionStorage.removeItem("paayh_statement_cache");
          window.dispatchEvent(new CustomEvent("paayh:balance_updated"));
        } catch {}

        onSuccess(data.ad || ad);
        onClose();
      } else {
        const res = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "publish_ad",
            amount: totalCost,
            metadata: {
              type: "publish_ad",
              adId: ad.id,
              user_email: ad.user_email,
            },
            callbackUrl: `${window.location.origin}/logged-in?view=myads`,
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
                {isFree ? "Publish Campaign" : step === "options" ? "Publish Campaign" : "Confirm Payment"}
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
                Your ad has been reviewed and approved. Launch it directly into the live feed.
              </p>
            ) : step === "options" ? (
              <>
                <p className={styles.noticeModalBodyPara}>
                  Your ad has been reviewed. Pay{" "}
                  <strong>{formatCurrency(totalCost, ad.country)}</strong> to launch
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
                          Available: {formatCurrency(userBalance, ad.country)}
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
                  Pay <strong>{formatCurrency(totalCost, ad.country)}</strong> via{" "}
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

"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import AdCard, { type Ad as CardAd } from "@/components/ui/AdCard";
import type { AdvertiserProfileData } from "@/components/ui/AdvertiserHoverCard";
import type { AdReportType } from "@/components/ui/AdOptionsMenu";
import type { Ad as DbAd, AdvertiserProfile } from "@/types/ads";
import { buildAdAppSchemeUrl, buildAdShareUrl } from "@/lib/utils/adShare";
import type { InteractionData } from "@/lib/hooks/useFeedActions";

interface PublicSharedAdViewProps {
  ad?: DbAd | CardAd;
  profile?: AdvertiserProfile | null;
  unavailable?: boolean;
  reason?: "not_found" | "expired" | "invalid_id";
  adId?: string;
}

export default function PublicSharedAdView({
  ad,
  profile,
  unavailable = false,
  reason,
  adId,
}: PublicSharedAdViewProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const loginReturnTo = useMemo(() => {
    const targetId = ad?.id || adId;
    if (unavailable || !targetId) {
      return "/logged-in?view=feed";
    }
    return `/logged-in?view=feed&sharedAdId=${encodeURIComponent(targetId)}`;
  }, [ad?.id, adId, unavailable]);

  const signInHref = useMemo(
    () => `/auth/login?returnTo=${encodeURIComponent(loginReturnTo)}`,
    [loginReturnTo]
  );

  const advertiserProfiles = useMemo<Record<string, AdvertiserProfileData>>(() => {
    if (!ad || !profile) return {};
    const key = ad.user_email?.toLowerCase();
    if (!key) return {};
    return {
      [key]: {
        email: profile.email || key,
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        business_name: profile.business_name,
        profileImage: profile.profileImage,
        gender: profile.gender,
        bio: profile.bio,
        location: profile.location,
        country: profile.country,
        created_at: profile.created_at,
        monetized: profile.monetized,
        is_career: profile.is_career,
        is_affiliate: profile.is_affiliate,
        affiliate_role: profile.affiliate_role,
      },
    };
  }, [ad, profile]);

  const promptSignIn = useCallback(
    (actionLabel: string) => {
      setNotice(`Sign in to ${actionLabel} and earn on Paayh.`);
      return false;
    },
    []
  );

  const handleAdEarn = useCallback(
    async (_ad: CardAd, _interactionData?: InteractionData) => promptSignIn("claim rewards"),
    [promptSignIn]
  );

  const handleAdMutual = useCallback(
    async (_ad: CardAd) => promptSignIn("connect with advertisers"),
    [promptSignIn]
  );

  const handleMarkSeen = useCallback(
    async (_ad: CardAd) => promptSignIn("interact with ads"),
    [promptSignIn]
  );

  const handleDismiss = useCallback(
    (_adId: string, _advertiserEmail?: string, _reportType?: AdReportType) => {
      promptSignIn("manage ad preferences");
    },
    [promptSignIn]
  );

  const handleShare = useCallback(async (id: string) => {
    const shareUrl = buildAdShareUrl(id);
    if (typeof navigator !== "undefined") {
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Check out this ad on Paayh",
            url: shareUrl,
          });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setNotice("Share link copied to clipboard.");
          return;
        } catch {}
      }
    }
    setNotice("Copy this link: " + shareUrl);
  }, []);

  const appDeepLink = useMemo(() => {
    const targetId = ad?.id || adId;
    return targetId ? buildAdAppSchemeUrl(targetId) : "xea-auth://";
  }, [ad?.id, adId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background, #ffffff)",
        color: "var(--foreground, #111111)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: "1px solid var(--border, rgba(128,128,128,0.2))",
          background: "var(--background, #ffffff)",
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <Link
            href="/"
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              letterSpacing: "-0.02em",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            Paayh
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {!unavailable && ad?.id && (
              <a
                href={appDeepLink}
                style={{
                  padding: "7px 14px",
                  borderRadius: "9999px",
                  border: "1px solid var(--border, rgba(128,128,128,0.3))",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "inherit",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Open in App
              </a>
            )}
            <a
              href={signInHref}
              style={{
                padding: "7px 16px",
                borderRadius: "9999px",
                background: "var(--foreground, #111111)",
                color: "var(--background, #ffffff)",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "600px",
          margin: "0 auto",
          padding: "16px 12px 48px",
        }}
      >
        {notice && (
          <div
            role="status"
            style={{
              marginBottom: "14px",
              padding: "10px 14px",
              borderRadius: "12px",
              border: "1px solid var(--border, rgba(128,128,128,0.25))",
              background: "var(--muted, rgba(128,128,128,0.08))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              fontSize: "0.85rem",
            }}
          >
            <span>{notice}</span>
            <a
              href={signInHref}
              style={{
                fontWeight: 600,
                color: "inherit",
                textDecoration: "underline",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </a>
          </div>
        )}

        {unavailable || !ad ? (
          <section
            aria-label="Ad unavailable"
            data-testid="shared-ad-unavailable"
            style={{
              textAlign: "center",
              padding: "48px 20px",
              borderRadius: "16px",
              border: "1px solid var(--border, rgba(128,128,128,0.2))",
              marginTop: "20px",
            }}
          >
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 8px" }}>
              This ad is no longer available
            </h1>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--muted-foreground, #6b7280)",
                maxWidth: "380px",
                margin: "0 auto 20px",
                lineHeight: 1.5,
              }}
            >
              {reason === "invalid_id"
                ? "The shared link appears to be invalid or incomplete."
                : "This campaign may have expired, completed, or been paused by the advertiser."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
              <Link
                href="/"
                style={{
                  padding: "10px 20px",
                  borderRadius: "9999px",
                  border: "1px solid var(--border, rgba(128,128,128,0.3))",
                  fontSize: "0.86rem",
                  fontWeight: 600,
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                Go to Paayh
              </Link>
              <a
                href={signInHref}
                style={{
                  padding: "10px 20px",
                  borderRadius: "9999px",
                  background: "var(--foreground, #111111)",
                  color: "var(--background, #ffffff)",
                  fontSize: "0.86rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sign in
              </a>
            </div>
          </section>
        ) : (
          <section aria-label="Shared ad" data-testid="shared-ad-single-view">
            <div
              style={{
                marginBottom: "10px",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--muted-foreground, #6b7280)",
                paddingLeft: "4px",
              }}
            >
              Shared Ad
            </div>
            <AdCard
              ad={ad as CardAd}
              userEmail=""
              advertiserProfiles={advertiserProfiles}
              viewerProfile={null}
              seenAds={[]}
              processingAds={[]}
              onAdEarn={handleAdEarn}
              onAdMutual={handleAdMutual}
              onMarkSeen={handleMarkSeen}
              onShare={handleShare}
              onDismiss={handleDismiss}
            />
          </section>
        )}
      </main>
    </div>
  );
}

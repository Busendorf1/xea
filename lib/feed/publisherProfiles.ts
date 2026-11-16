import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import type { AdvertiserProfile } from "@/types/ads";

export const l1PublisherProfilesCache = new Map<
  string,
  { profile: AdvertiserProfile; expiresAt: number }
>();

const l1BlockedPublishersCache = new Map<
  string,
  { blocked: boolean; expiresAt: number }
>();

export function formatPublisherProfile(p: any): AdvertiserProfile {
  const rawFirst =
    typeof p.firstName === "string" && !p.firstName.startsWith("enc:v1:")
      ? p.firstName
      : "";
  const rawLast =
    typeof p.lastName === "string" && !p.lastName.startsWith("enc:v1:")
      ? p.lastName
      : "";
  return {
    email: p.email,
    username: p.username || (p.email ? p.email.split("@")[0] : "Advertiser"),
    business_name: p.business_name || "",
    firstName: rawFirst,
    lastName: rawLast,
    profileImage: p.profileImage || "",
    gender: p.gender || "",
    bio: p.bio || "",
    location: p.location || "",
    country: p.country || "",
    created_at: p.created_at || "",
    monetized:
      p.monetized === true || p.monetized === "true" || p.monetized === "yes",
    is_career: Boolean(p.is_career),
    is_affiliate: Boolean(p.is_affiliate),
    affiliate_role: p.affiliate_role || null,
    isExemptFromBarriersAndInactivity: isExemptFromBarriersAndInactivity(p.email, p),
  };
}

export function isPublisherAccountBlocked(email: string | null | undefined): boolean {
  if (!email) return false;
  const cached = l1BlockedPublishersCache.get(email.toLowerCase().trim());
  return Boolean(cached && Date.now() < cached.expiresAt && cached.blocked);
}

export async function hydratePublisherProfiles(
  publisherEmails: string[],
  profilesMap: Record<string, AdvertiserProfile>
): Promise<void> {
  const emailLookupSet = new Set<string>();
  for (const pubEmail of publisherEmails) {
    const lower = pubEmail.toLowerCase().trim();
    const cachedPub = l1PublisherProfilesCache.get(lower);
    if (cachedPub && Date.now() < cachedPub.expiresAt) {
      profilesMap[lower] = cachedPub.profile;
    } else {
      emailLookupSet.add(pubEmail);
      emailLookupSet.add(lower);
    }
  }

  const missingPublisherEmails = Array.from(emailLookupSet);
  if (missingPublisherEmails.length === 0) return;

  const { data: profiles, error: profilesError } = await supabaseReadOnly
    .from("users")
    .select(
      'email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role, ad_account_status'
    )
    .in("email", missingPublisherEmails);

  if (!profilesError && profiles) {
    const pubExp = Date.now() + 5 * 60 * 1000;
    profiles.forEach((p: any) => {
      if (p.email) {
        const lower = p.email.toLowerCase();
        const status = String(p.ad_account_status || "active").toLowerCase().trim();
        l1BlockedPublishersCache.set(lower, {
          blocked: status === "deactivated" || status === "perm_banned",
          expiresAt: pubExp,
        });
        const formatted = formatPublisherProfile(p);
        profilesMap[lower] = formatted;
        l1PublisherProfilesCache.set(lower, {
          profile: formatted,
          expiresAt: pubExp,
        });
      }
    });
  }
}

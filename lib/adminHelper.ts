/**
 * Helper to check if an email belongs to an administrator, affiliate, or career badge holder.
 * Safe for both Client and Server execution (zero server/Node dependencies).
 */

export interface SpecialRoleConfig {
  isCareer: boolean;
  isAffiliate: boolean;
  affiliateRole: string | null;
  affiliateShareRate: number; // Fraction of total ad CPI (0.10 = 10% of ad CPI, i.e. 20% of platform's 50% share)
}

export const PRECONFIGURED_SPECIAL_ROLES: Record<string, SpecialRoleConfig> = {
  "nonsom019@gmail.com": {
    isCareer: true,
    isAffiliate: true,
    affiliateRole: "Affiliate Developer",
    affiliateShareRate: 0.10,
  },
  "nonsom2023@gmail.com": {
    isCareer: true,
    isAffiliate: true,
    affiliateRole: "Affiliate First Agent",
    affiliateShareRate: 0.10,
  },
};

export const DEFAULT_ADMIN_EMAILS = [
  "nonsom019@gmail.com",
  "nonsom2023@gmail.com",
  "admin@paayh.com",
  "support@paayh.com",
];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (DEFAULT_ADMIN_EMAILS.includes(clean)) return true;

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(clean);
}

export function getSpecialRoleProfile(
  email?: string | null,
  dbRow?: {
    is_career?: boolean | null;
    is_affiliate?: boolean | null;
    affiliate_role?: string | null;
    isCareer?: boolean | null;
    isAffiliate?: boolean | null;
    affiliateRole?: string | null;
  } | null
): {
  isCareer: boolean;
  isAffiliate: boolean;
  affiliateRole: string | null;
  isExempt: boolean;
} {
  const clean = (email || "").trim().toLowerCase();
  const preset = clean ? PRECONFIGURED_SPECIAL_ROLES[clean] : undefined;

  const dbCareer =
    dbRow?.is_career === true || dbRow?.isCareer === true ? true : undefined;
  const dbAffiliate =
    dbRow?.is_affiliate === true || dbRow?.isAffiliate === true ? true : undefined;
  const dbRole =
    (typeof dbRow?.affiliate_role === "string" && dbRow.affiliate_role.trim()) ||
    (typeof dbRow?.affiliateRole === "string" && dbRow.affiliateRole.trim()) ||
    null;

  const isCareer = Boolean(dbCareer ?? preset?.isCareer ?? false);
  const isAffiliate = Boolean(dbAffiliate ?? preset?.isAffiliate ?? false);
  const affiliateRole = isAffiliate
    ? dbRole || preset?.affiliateRole || "Platform Affiliate"
    : null;

  const isExempt = isAdminEmail(clean) || isAffiliate || isCareer;

  return {
    isCareer,
    isAffiliate,
    affiliateRole,
    isExempt,
  };
}

export function isAffiliateOrCareerAccount(
  email?: string | null,
  dbRow?: {
    is_career?: boolean | null;
    is_affiliate?: boolean | null;
    affiliate_role?: string | null;
    isCareer?: boolean | null;
    isAffiliate?: boolean | null;
    affiliateRole?: string | null;
  } | null
): boolean {
  const profile = getSpecialRoleProfile(email, dbRow);
  return profile.isAffiliate || profile.isCareer;
}

export function isExemptFromBarriersAndInactivity(
  email?: string | null,
  dbRow?: {
    is_career?: boolean | null;
    is_affiliate?: boolean | null;
    affiliate_role?: string | null;
    isCareer?: boolean | null;
    isAffiliate?: boolean | null;
    affiliateRole?: string | null;
  } | null
): boolean {
  return getSpecialRoleProfile(email, dbRow).isExempt;
}

/**
 * validationSchemas.ts — Web (Next.js)
 *
 * All Zod schemas used for client-side and server-side validation.
 * Age minimum: 18 years old.
 * Auth (login/join) is handled by Auth0 — no schemas needed here.
 */

import { z } from "zod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ageFromDob(dob: string): number {
  const ms = Date.now() - new Date(dob).getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

const noLinksMsg = (field: string) =>
  `Links are not allowed in ${field}`;
const noInjectionMsg = (field: string) =>
  `${field} contains disallowed content`;

const hasLinks = (v: string) =>
  /(https?:\/\/|www\.|\\.com|\\.net|\\.org|\\.io|mailto:|tel:)/i.test(v);
const hasInjection = (v: string) =>
  /<script|<iframe|<body|<html|javascript:|data:|file:|--|\\bUNION\\b|\\bSELECT\\b|xp_/i.test(v);

/** Builds a z.string chain with max, no-links and no-injection refines */
function safeStr(field: string, max: number) {
  return z
    .string()
    .max(max, `${field} must be ${max} characters or fewer`)
    .refine((v) => !hasLinks(v), { message: noLinksMsg(field) })
    .refine((v) => !hasInjection(v), { message: noInjectionMsg(field) });
}

function safeStrInject(field: string) {
  return z
    .string()
    .refine((v) => !hasInjection(v), { message: noInjectionMsg(field) });
}

// ─── Profile Setup (web) ─────────────────────────────────────────────────────

export const profileSetupStep1Schema = z.object({
  dob: z
    .string()
    .min(1, "Date of birth is required")
    .refine((d) => !isNaN(new Date(d).getTime()), "Enter a valid date")
    .refine((d) => ageFromDob(d) >= 18, "You must be at least 18 years old")
    .refine((d) => ageFromDob(d) <= 120, "Enter a valid date of birth"),

  phone: z
    .string()
    .min(7, "Phone number too short")
    .max(20, "Phone number too long")
    .regex(/^\+?[0-9\s\-()]+$/, "Enter a valid phone number (digits only)"),

  gender:     z.string().min(1, "Select a gender"),
  employment: z.string().min(1, "Select an employment status"),
  country:    z.string().min(1, "Select a country"),
  state:      z.string().min(1, "Select a state / region"),
  location:   z.string().min(1, "Select a city / location"),

  businessName: z.string().max(25, "Business name must be 25 characters or fewer").optional().or(z.literal("")),
  bio:          z.string().max(90, "Bio must be 90 characters or fewer").optional().or(z.literal("")),
});

export type ProfileSetupStep1 = z.infer<typeof profileSetupStep1Schema>;

// ─── Ad Form (web, multi-step) ────────────────────────────────────────────────

/** Step 2 — audience / budget */
export const adAudienceSchema = z.object({
  impressions: z
    .number()
    .min(100, "Minimum 100 impressions")
    .max(5_000_000, "Maximum 5,000,000 impressions"),

  campaignDays: z
    .number()
    .min(1, "Minimum 1 day")
    .max(365, "Maximum 365 days"),

  userFrequencyCap: z
    .number()
    .min(1, "Minimum 1 view per user")
    .max(100, "Maximum 100 views per user"),

  minAge: z.number().min(18, "Minimum age is 18").max(100).optional(),
  maxAge: z.number().min(18).max(100, "Maximum age is 100").optional(),
}).refine(
  (d) => d.minAge === undefined || d.maxAge === undefined || d.minAge <= d.maxAge,
  { message: "Minimum age cannot exceed maximum age", path: ["minAge"] }
);

const actionDetailsSchema = z.object({
  phone: z
    .string().max(150)
    .regex(/^\+?[0-9\s\-()]+$/, "Enter a valid phone number")
    .optional().or(z.literal("")),
  whatsapp: z
    .string().max(150)
    .regex(/^\+?[0-9\s\-()]+$/, "Enter a valid WhatsApp number")
    .optional().or(z.literal("")),
  website: z
    .string().max(150)
    .refine((v) => !v || v.startsWith("https://"), "Website must start with https://")
    .refine(
      (v) => !v || (!v.startsWith("javascript:") && !v.startsWith("data:") && !v.startsWith("file:")),
      "Invalid link scheme"
    )
    .optional().or(z.literal("")),
  email: z
    .string().max(150)
    .email("Enter a valid email address")
    .optional().or(z.literal("")),
  ios: z
    .string().max(150)
    .refine((v) => !v || v.startsWith("https://"), "iOS app link must start with https://")
    .refine(
      (v) => !v || (!v.startsWith("javascript:") && !v.startsWith("data:") && !v.startsWith("file:")),
      "Invalid link scheme"
    )
    .optional().or(z.literal("")),
  android: z
    .string().max(150)
    .refine((v) => !v || v.startsWith("https://"), "Android app link must start with https://")
    .refine(
      (v) => !v || (!v.startsWith("javascript:") && !v.startsWith("data:") && !v.startsWith("file:")),
      "Invalid link scheme"
    )
    .optional().or(z.literal("")),
}).optional();

/** Step 3 — ad creative (non-product_sales) */
export const adCreativeSchema = z.object({
  adContent: z.string().min(5, "Ad content is too short"),
  actionDetails: actionDetailsSchema,
  adActionButtons: z.array(z.string()).optional(),
}).refine((data) => {
  const hasReadMore = data.adActionButtons?.includes("read_more");
  const maxLen = hasReadMore ? 500 : 220;
  return data.adContent.length <= maxLen;
}, {
  message: "Ad content must be 220 characters or fewer (or up to 500 characters if 'Read More' button is selected)",
  path: ["adContent"]
}).refine((data) => !hasLinks(data.adContent), {
  message: "Links are not allowed in Ad content",
  path: ["adContent"]
}).refine((data) => !hasInjection(data.adContent), {
  message: "Ad content contains disallowed content",
  path: ["adContent"]
});

/** Step 3 extra fields for product_sales */
export const adCreativeProductSchema = z.object({
  adContent: safeStr("Ad content", 200).min(5, "Ad content is too short"),
  actionDetails: actionDetailsSchema,
  productName: z
    .string()
    .min(1, "Product name is required")
    .max(80, "Product name must be 80 characters or fewer")
    .refine((v) => !hasInjection(v), noInjectionMsg("Product name")),
  productPrice: z
    .string()
    .min(1, "Product price is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price (e.g. 5000 or 5000.00)")
    .refine((v) => parseFloat(v) > 0, "Price must be greater than 0"),
  productCtaLink: z
    .string()
    .min(1, "CTA link is required")
    .url("Enter a valid URL")
    .refine((v) => v.startsWith("https://"), "Link must start with https://")
    .refine(
      (v) => !v.startsWith("javascript:") && !v.startsWith("data:") && !v.startsWith("file:"),
      "Invalid link scheme"
    ),
});

// ─── Help Center (web) ───────────────────────────────────────────────────────

export const helpSchema = z.object({
  name: z.string().max(100, "Name must be 100 characters or fewer").optional().or(z.literal("")),

  email: z.string().email("Enter a valid email address"),

  category: z.string().min(1, "Select a category"),

  subject: safeStrInject("Subject")
    .min(3, "Subject is too short (min 3 characters)")
    .max(150, "Subject must be 150 characters or fewer"),

  message: safeStrInject("Message")
    .min(20, "Message is too short (min 20 characters)")
    .max(2000, "Message must be 2000 characters or fewer"),
});

export type HelpFormData = z.infer<typeof helpSchema>;

import React from "react";
import {
  ShoppingBag,
  ShoppingCart,
  Calendar,
  FileText,
  MessageSquare,
  CheckCircle2,
  Heart,
  Users,
  ExternalLink,
} from "lucide-react";

export interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

export type MultiStepAdFormProps = {
  session: Session;
};

export const adRates: Record<string, number> = {
  politics: 1500,
  business: 45,
  government: 2000,
  individual: 25,
  religion: 1500,
  product_sales: 55,
};

export const steps = [
  "Category",
  "Audience",
  "Budget",
  "Creative",
  "Summary",
  "Launch",
];

export const getCtaIcon = (cta: string): React.ReactNode => {
  switch (cta) {
    case "Buy":
    case "Shop":
      return React.createElement(ShoppingBag, { size: 15 });
    case "Order":
      return React.createElement(ShoppingCart, { size: 15 });
    case "Book":
    case "Reserve":
      return React.createElement(Calendar, { size: 15 });
    case "Apply":
      return React.createElement(FileText, { size: 15 });
    case "Comment":
      return React.createElement(MessageSquare, { size: 15 });
    case "Vote":
      return React.createElement(CheckCircle2, { size: 15 });
    case "Donate":
      return React.createElement(Heart, { size: 15 });
    case "Volunteer":
    case "Join":
      return React.createElement(Users, { size: 15 });
    case "Learn More":
    case "Visit Website":
    default:
      return React.createElement(ExternalLink, { size: 15 });
  }
};

export type Category =
  | "industry"
  | "interest"
  | "lifestyle"
  | "behavior"
  | "personality";

export type AdMediaType = "text" | "image" | "video" | "mixed";

export interface AdFormSelections {
  industry: string[];
  interest: string[];
  lifestyle: string[];
  behavior: string[];
  personality: string[];
  ageRange: [number, number];
  targetingAll: boolean;
  impressions: number;
  campaignDays: number;
  userFrequencyCap: number;
  country: string;
  state: string;
  province: string;
  targetLocations: string[];
  gender: string;
  employmentStatus: string[];
  adMediaType: AdMediaType | "";
  adContent: string;
  adMediaFiles: File[];
  existingMedia: string;
  adActionButtons: ("phone" | "whatsapp" | "website" | "email" | "ios" | "android" | "read_more" | "watch_now")[];
  actionDetails: {
    phone: string;
    whatsapp: string;
    website: string;
    email: string;
    ios: string;
    android: string;
    watch_now: string;
  };
  displayMutualButton: boolean;
  productName: string;
  productPrice: string;
  productCtaType: string;
  productCtaLink: string;
  customSponsorName: string;
  customSponsorHandle: string;
  customSponsorLogo: string;
}

export const containsLink = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  return urlRegex.test(text);
};

export const isSubsidizedLink = (link: string) => {
  try {
    const url = new URL(link);
    return url.hostname.includes("baggyt.com");
  } catch {
    return false;
  }
};

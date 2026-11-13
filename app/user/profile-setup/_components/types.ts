export interface ProfileFormData {
  username: string;
  dob: string;
  phone: string;
  country: string;
  state: string;
  location: string;
  bio: string;
  gender: string;
  employment: string;
  intlTravel: string;
  localTravel: string;
  industry: string[];
  interest: string[];
  behavior: string[];
  lifestyle: string[];
  personality: string[];
  businessName: string;
  [key: string]: string | string[];
}

export type DropdownKey =
  | "industry"
  | "interest"
  | "behavior"
  | "lifestyle"
  | "personality";

export type OpenDropdownsState = Record<DropdownKey, boolean>;

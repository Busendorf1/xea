export interface UserProfile {
  id: string;
  profileImage: string | null;
  username: string;
  firstName: string | null;
  lastName: string | null;
  lastUpdated: string;
  bio: string | null;
  interest: string[] | string;
  email: string;
  industry: string[] | string;
  behavior: string[] | string;
  lifestyle: string[] | string;
  personality: string[] | string;
  gender?: string | null;
  monetized: boolean | string;
  monetized_at: string | null;
  created_at: string;
  monetized_until?: string | null;
  monetization_type?: string | null;
  country: string | null;
  state: string | null;
  location: string | null;
  phone: string;
  business_name: string | null;
  passphrase: string;
  mutual_count: number;
  balance: number;
  withdrawal: number;
  bvn_hash?: string | null;
  monetization_clicks?: number;
  referral_code?: string | null;
  referral_downloads_count?: number;
  atw_tier?: string | null;
  last_active_at?: string | null;
  attention_worth_score?: number | null;
  daysInactive?: number;
}

export interface DashboardClientProps {
  user: UserProfile;
  parsedInterest: string[];
  email: string;
  initialAds?: any[];
  initialProfiles?: Record<string, any>;
  initialHighlights?: any[];
}

export const DEFAULT_NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "Opay (Paycom)", code: "999992" },
  { name: "Palmpay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Taj Bank", code: "302" },
  { name: "Titan Trust Bank", code: "102" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

export const parseToArray = (val: string[] | string | null | undefined): string[] => {
  if (!val) return [];
  return Array.isArray(val) ? val : val.split(",").map((v) => v.trim());
};

export const formatRelativeTime = (timestamp: string | Date | null | undefined): string => {
  if (!timestamp) return "Never";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 0 || isNaN(diffMs)) return "Just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return sec <= 1 ? "1 sec ago" : `${sec} secs ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 min ago" : `${min} mins ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
};

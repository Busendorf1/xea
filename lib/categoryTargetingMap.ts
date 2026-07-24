/**
 * categoryTargetingMap — Web (Full)
 *
 * Each ad category maps to exactly the targeting options available
 * for that tier. Zero overlap between categories — prevents advertisers
 * from choosing a cheap category and targeting a premium audience.
 *
 * Web version: full targeting set (100%).
 * Mobile version uses 40% of this set (see xea-mobile/lib/categoryTargetingMap.ts).
 */

export type AdCategory =
  | "politics"
  | "business"
  | "government"
  | "individual"
  | "religion"
  | "product_sales";

export type TargetingDimension =
  | "industry"
  | "interest"
  | "lifestyle"
  | "behavior"
  | "personality";

export type TargetingMap = Record<TargetingDimension, string[]>;

export const categoryTargetingMap: Record<AdCategory, TargetingMap> = {

  // ── INDIVIDUAL ── ₦15/view ────────────────────────────────────────────────
  // Minimal targeting: broad spray, no commercial specificity.
  // Individual advertisers cannot reach professional or consumer-intent audiences.
  individual: {
    industry: [], // individuals are not targeted by industry
    interest: [
      "Dating",
      "Photography",
      "Lifestyle",
    ],
    lifestyle: [
      "Night Owl",
      "Homebody",
      "Budget‑Conscious",
    ],
    behavior: [
      "Daily App User",
      "Mobile‑first",
      "Night User",
      "Watches How‑To Videos",
    ],
    personality: [
      "Introvert",
      "Pessimistic",
      "Follower",
      "Observer",
    ],
  },

  // ── BUSINESS ── ₦25/view ─────────────────────────────────────────────────
  // Professional audience targeting: industry + career + B2B behavior signals.
  business: {
    industry: [
      "Technology",
      "Finance",
      "Entertainment",
      "Construction",
      "Real Estate",
      "Telecommunications",
      "Marketing",
      "Insurance",
      "Logistics",
      "Consulting",
      "Diversity & Inclusion",
    ],
    interest: [
      "Jobs",
      "Business",
      "Investing",
      "Tech",
      "Finance",
      "Online Courses",
      "Movies",
      "Comedy",
      "Music",
      "News",
      "Shows",
    ],
    lifestyle: [
      "Career‑Driven",
      "Tech‑Savvy",
      "Urban Dweller",
      "Early Riser",
      "Remote Worker",
      "Frequent Flyer",
      "Workaholic",
      "Digital Nomad",
      "Balanced Life",
    ],
    behavior: [
      "Researcher",
      "Subscribes Newsletters",
      "Downloads Freebies",
      "Loyal Customer",
      "Early Adopter",
      "Prefers Premium",
      "Needs Instant Response",
    ],
    personality: [
      "Extrovert",
      "Analytical",
      "Innovative",
      "Confident",
      "Skeptical",
      "Cautious",
      "Meticulous",
      "Perfectionist",
    ],
  },

  // ── PRODUCT SALES ── ₦40/view ─────────────────────────────────────────────
  // Consumer targeting: the richest dimension on the platform.
  // Every meaningful purchase-intent and consumer-lifestyle signal.
  product_sales: {
    industry: [
      "Retail",
      "Hospitality",
      "Entertainment",
      "Manufacturing",
      "Design",
      "Agriculture",
      "Automotive",
    ],
    interest: [
      "Shopping",
      "Fashion",
      "Beauty",
      "Home Decor",
      "Cars",
      "Cooking",
      "Sports",
      "Fitness",
      "Gaming",
      "Movies",
      "Music",
      "Books",
      "Parenting",
      "Travel",
    ],
    lifestyle: [
      "Luxury‑Seeking",
      "Minimalist",
      "Fitness‑Oriented",
      "Adventurous",
      "Pet Lover",
      "Art Enthusiast",
      "Foodie",
      "DIYer",
      "Health Nut",
      "Solo Traveler",
      "Collector",
      "Gamer",
    ],
    behavior: [
      "Online Shopper",
      "Window Shopper",
      "Impulsive Buyer",
      "Saves Products",
      "Abandons Cart",
      "Buys via Referral",
      "Searches Reviews",
      "Follows Brands",
      "Uses Coupons",
      "Buys in Sales",
      "Price‑Sensitive",
      "Seeks Deals",
      "Reviews Often",
      "Follows Influencers",
      "Clicks Ads",
    ],
    personality: [
      "Creative",
      "Optimistic",
      "Spontaneous",
      "Adventurous",
      "Playful",
      "Flexible",
      "Curious",
    ],
  },

  // ── POLITICS ── ₦1,500/view ───────────────────────────────────────────────
  // Civic and advocacy targeting: media, political engagement, leadership.
  politics: {
    industry: [
      "Media",
      "Politics",
      "NGO",
      "Environmental",
    ],
    interest: [
      "Politics",
      "Volunteering",
    ],
    lifestyle: [
      "Eco‑Conscious",
      "Social Butterfly",
    ],
    behavior: [
      "High Engagement",
      "Shares Content",
    ],
    personality: [
      "Assertive",
      "Leader",
      "Strategic",
      "Ambitious",
      "Empathetic",
    ],
  },

  // ── GOVERNMENT ── ₦1,500/view ─────────────────────────────────────────────
  // Public sector targeting: institutions, civic duty, public service.
  government: {
    industry: [
      "Healthcare",
      "Education",
      "Transportation",
      "Energy",
      "Legal",
      "Government",
      "Security",
      "Mining",
    ],
    interest: [
      "Health",
      "Education",
      "Environment",
    ],
    lifestyle: [
      "Countryside Living",
      "Volunteer‑Minded",
    ],
    behavior: [
      "Engages with Polls",
    ],
    personality: [
      "Pragmatic",
      "Disciplined",
      "Serious",
      "Dependable",
    ],
  },

  // ── RELIGION ── ₦1,500/view ───────────────────────────────────────────────
  // Faith community targeting: belief, tradition, and community values.
  religion: {
    industry: [
      "Nonprofit",
      "Religion",
    ],
    interest: [
      "Religion",
      "Spirituality",
    ],
    lifestyle: [
      "Family‑Oriented",
      "Spiritual",
    ],
    behavior: [
      "Attends Webinars",
    ],
    personality: [
      "Kind‑Hearted",
      "Traditional",
    ],
  },
};

/** All targeting dimensions in display order */
export const TARGETING_DIMENSIONS: TargetingDimension[] = [
  "industry",
  "interest",
  "lifestyle",
  "behavior",
  "personality",
];

/**
 * Extract all unique targeting options for a given dimension across all ad categories.
 * Guarantees that /profile-setup, profile updates, and /adPage remain 100% in sync automatically.
 */
export function getUniqueTargetingOptions(dimension: TargetingDimension): string[] {
  const optionsSet = new Set<string>();
  (Object.keys(categoryTargetingMap) as AdCategory[]).forEach((cat) => {
    categoryTargetingMap[cat][dimension]?.forEach((opt) => optionsSet.add(opt));
  });
  return Array.from(optionsSet);
}

export const ALL_INDUSTRIES: string[] = getUniqueTargetingOptions("industry");
export const ALL_INTERESTS: string[] = getUniqueTargetingOptions("interest");
export const ALL_LIFESTYLES: string[] = getUniqueTargetingOptions("lifestyle");
export const ALL_BEHAVIORS: string[] = getUniqueTargetingOptions("behavior");
export const ALL_PERSONALITY_TRAITS: string[] = getUniqueTargetingOptions("personality");

export const ALL_TARGETING_OPTIONS: Record<TargetingDimension, string[]> = {
  industry: ALL_INDUSTRIES,
  interest: ALL_INTERESTS,
  lifestyle: ALL_LIFESTYLES,
  behavior: ALL_BEHAVIORS,
  personality: ALL_PERSONALITY_TRAITS,
};


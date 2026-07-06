
"use client";

import { useEffect, useState } from "react";
import styles from "../Ad/page.module.css";
import HeaderJoin from "../HeaderJoin/page";
import LocationSelector from "../LocationSelector";
import { v4 as uuidv4 } from "uuid";
import supabase from "@/lib/utils/db";
import AdPreviewCard from "../Adreview/page";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MultiStepAdFormProps = {
  session: Session;
};

const adRates: Record<string, number> = {
  politics: 1500,
  business: 25,
  government: 1500,
  individual: 15,
  religion: 1500,
  product_sales: 40,
};
//we can pay 60%
const steps = ["Ad Type", "Targeting", "Location", "Ad Creative", "Summary"];

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Category =
  | "industry"
  | "interest"
  | "lifestyle"
  | "behavior"
  | "personality";
type AdMediaType = "text" | "image" | "video" | "mixed";

export default function MultiStepAdForm({ session }: MultiStepAdFormProps) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [adType, setAdType] = useState("politics");
  const [categories, setCategories] = useState<Category[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<Category, string[]>>({
    industry: [],
    interest: [],
    lifestyle: [],
    behavior: [],
    personality: [],
  });

  const [formSelections, setFormSelections] = useState({
    industry: [] as string[],
    interest: [] as string[],
    lifestyle: [] as string[],
    behavior: [] as string[],
    personality: [] as string[],
    ageRange: [18, 65],
    targetingAll: false,
    impressions: 1000,
    campaignDays: 5,
    userFrequencyCap: 1,
    country: "",
    state: "",
    province: "",
    gender: "",
    employmentStatus: [] as string[],
    adMediaType: "" as AdMediaType | "",
    adContent: "",
    adMediaFiles: [] as File[],
    adActionButtons: [] as ("phone" | "whatsapp" | "website" | "email")[],
    actionDetails: {
      phone: "",
      whatsapp: "",
      website: "",
      email: "",
    },
    displayMutualButton: false,
    productName: "",
    productPrice: "",
    productCtaType: "Buy Now",
    productCtaLink: "",
  });

  const [mediaError, setMediaError] = useState("");
  const [userProfile, setUserProfile] = useState<{
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setUserProfile({
              mutual_count: data.mutual_count ?? 0,
              mutuals: data.mutuals ?? [],
              last_mutual_spent: data.last_mutual_spent,
              balance: data.balance ?? 0,
            });
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }
      }
    };
    fetchUserProfile();
  }, [session]);

  useEffect(() => {
    const fetchedCategories: Category[] = [
      "industry",
      "interest",
      "lifestyle",
      "behavior",
      "personality",
    ];

    const fetchedOptionsMap: Record<Category, string[]> = {
      industry: [
        "Technology",
        "Healthcare",
        "Finance",
        "Education",
        "Retail",
        "Construction",
        "Real Estate",
        "Hospitality",
        "Transportation",
        "Media",
        "Entertainment",
        "Telecommunications",
        "Energy",
        "Legal",
        "Marketing",
        "Insurance",
        "Government",
        "Nonprofit",
        "Manufacturing",
        "Logistics",
        "Security",
        "Consulting",
        "Design",
        "Agriculture",
        "Automotive",
        "Mining",
        "Politics",
        "Religion",
        "NGO",
        "Environmental",
        "Diversity & Inclusion",
      ],
      interest: [
        "Jobs",
        "Business",
        "Investing",
        "Fashion",
        "Fitness",
        "Sports",
        "Health",
        "Travel",
        "Education",
        "Tech",
        "Gaming",
        "Politics",
        "Religion",
        "Movies",
        "Music",
        "Lifestyle",
        "Shopping",
        "Books",
        "Beauty",
        "Home Decor",
        "Parenting",
        "Spirituality",
        "Cars",
        "Cooking",
        "Photography",
        "Volunteering",
        "Environment",
        "Dating",
        "Finance",
        "Online Courses",
      ],
      lifestyle: [
        "Luxury‑Seeking",
        "Minimalist",
        "Eco‑Conscious",
        "Fitness‑Oriented",
        "Family‑Oriented",
        "Adventurous",
        "Spiritual",
        "Career‑Driven",
        "Budget‑Conscious",
        "Tech‑Savvy",
        "Pet Lover",
        "Urban Dweller",
        "Countryside Living",
        "Night Owl",
        "Early Riser",
        "Remote Worker",
        "Frequent Flyer",
        "Homebody",
        "Volunteer‑Minded",
        "Art Enthusiast",
        "Foodie",
        "DIYer",
        "Health Nut",
        "Social Butterfly",
        "Solo Traveler",
        "Workaholic",
        "Balanced Life",
        "Digital Nomad",
        "Collector",
        "Gamer",
      ],
      behavior: [
        "Online Shopper",
        "Window Shopper",
        "Impulsive Buyer",
        "Researcher",
        "High Engagement",
        "Clicks Ads",
        "Saves Products",
        "Abandons Cart",
        "Subscribes Newsletters",
        "Downloads Freebies",
        "Shares Content",
        "Buys via Referral",
        "Attends Webinars",
        "Engages with Polls",
        "Searches Reviews",
        "Watches How‑To Videos",
        "Follows Brands",
        "Uses Coupons",
        "Buys in Sales",
        "Daily App User",
        "Loyal Customer",
        "Early Adopter",
        "Price‑Sensitive",
        "Mobile‑first",
        "Night User",
        "Seeks Deals",
        "Prefers Premium",
        "Needs Instant Response",
        "Reviews Often",
        "Follows Influencers",
      ],
      personality: [
        "Introvert",
        "Extrovert",
        "Ambitious",
        "Creative",
        "Analytical",
        "Empathetic",
        "Pragmatic",
        "Optimistic",
        "Pessimistic",
        "Curious",
        "Disciplined",
        "Spontaneous",
        "Confident",
        "Cautious",
        "Assertive",
        "Playful",
        "Serious",
        "Flexible",
        "Meticulous",
        "Innovative",
        "Traditional",
        "Adventurous",
        "Skeptical",
        "Dependable",
        "Perfectionist",
        "Kind‑Hearted",
        "Leader",
        "Follower",
        "Observer",
        "Strategic",
      ],
    };

    setCategories(fetchedCategories);
    setOptionsMap(fetchedOptionsMap);
  }, []);

  const toggleSelection = (type: Category, value: string) => {
    setFormSelections((prev) => {
      const list = prev[type];
      const updated = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [type]: updated };
    });
  };

  const toggleEmploymentStatus = (status: string) => {
    setFormSelections((prev) => {
      const currentList = Array.isArray(prev.employmentStatus)
        ? prev.employmentStatus
        : prev.employmentStatus
        ? (prev.employmentStatus as string).split(",").map((s) => s.trim())
        : [];

      let updated: string[];
      if (currentList.includes(status)) {
        updated = currentList.filter((s) => s !== status);
      } else {
        if (currentList.length >= 4) {
          alert("You can select up to 4 employment statuses.");
          return prev;
        }
        updated = [...currentList, status];
      }
      return { ...prev, employmentStatus: updated };
    });
  };

  const handleTargetAll = (cat: Category) => {
    setFormSelections((prev) => ({
      ...prev,
      [cat]: optionsMap[cat],
    }));
  };



  const calculateTotalCostPerImpression = () => {
    return adRates[adType];
  };

  const calculateTotalCost = () => {
    return calculateTotalCostPerImpression() * formSelections.impressions;
  };

  const resetForm = () => {
    setFormSelections({
      industry: [],
      interest: [],
      lifestyle: [],
      behavior: [],
      personality: [],
      ageRange: [18, 65],
      targetingAll: false,
      impressions: 1000,
      campaignDays: 5,
      userFrequencyCap: 1,
      country: "",
      state: "",
      province: "",
      gender: "",
      employmentStatus: [],
      adMediaType: "",
      adContent: "",
      adMediaFiles: [],
      adActionButtons: [],
      actionDetails: {
        phone: "",
        whatsapp: "",
        website: "",
        email: "",
      },
      displayMutualButton: false,
      productName: "",
      productPrice: "",
      productCtaType: "Buy Now",
      productCtaLink: "",
    });
    setAdType("politics");
  };

  const containsLink = (text: string) => {
    return /(https?:\/\/|www\.|\.com|\.net|\.org|\.io|mailto:|tel:)/i.test(
      text
    );
  };

  const validateStep3 = () => {
    if (!formSelections.adMediaType) return false;
    if (formSelections.adMediaType !== "text" && formSelections.adMediaFiles.length === 0) return false;
    if (containsLink(formSelections.adContent)) return false;
    
    if (adType === "product_sales") {
      if (!formSelections.productName.trim() || formSelections.productName.length > 80) return false;
      const price = parseFloat(formSelections.productPrice);
      if (isNaN(price) || price <= 0) return false;
      if (!formSelections.productCtaLink.trim() || !formSelections.productCtaLink.startsWith("https://")) return false;
      if (!formSelections.adContent.trim() || formSelections.adContent.length > 200) return false;
      if (formSelections.adActionButtons.length > 2) return false;
    } else {
      if (formSelections.adActionButtons.length > 3) return false;
    }
    return true;
  };

  const submitAd = async () => {
    if (isSubmitting) return;
    if (!session || !session.user?.email) {
      alert("❌ User not authenticated. Please log in.");
      return;
    }

    const adId = uuidv4();
    const costPerImpression = calculateTotalCostPerImpression();
    const totalCost = calculateTotalCost();

    if (paymentMethod === "wallet" && userProfile && userProfile.balance < totalCost) {
      alert(`❌ Insufficient wallet balance. Your balance is ${formatCurrency(userProfile.balance)} but this campaign costs ${formatCurrency(totalCost)}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      let mediaUrlString: string | null = null;

      if (formSelections.adMediaFiles && formSelections.adMediaFiles.length > 0) {
        const mediaUrls: string[] = [];
        for (let i = 0; i < formSelections.adMediaFiles.length; i++) {
          const file = formSelections.adMediaFiles[i];
          const sanitizedFileName = file.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from("ad-media")
            .getPublicUrl(uniqueFileName);

          if (publicUrlData?.publicUrl) {
            mediaUrls.push(publicUrlData.publicUrl);
          }
        }
        mediaUrlString = mediaUrls.join(",");
      }

      // Initialize Paystack payment or wallet pay depending on selector
      let paymentUrl = "/api/payments/initialize";
      if (paymentMethod === "wallet") {
        paymentUrl = "/api/payments/wallet-pay";
      }

      const paymentResponse = await fetch(paymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ad",
          amount: totalCost,
          metadata: {
            type: "ad",
            user_email: session.user.email?.toLowerCase(),
            adData: {
              id: adId,
              adType,
              industry: formSelections.industry,
              interest: formSelections.interest,
              lifestyle: formSelections.lifestyle,
              behavior: formSelections.behavior,
              personality: formSelections.personality,
              ageRange: formSelections.ageRange,
              targetingAll: formSelections.targetingAll ?? false,
              impressions: formSelections.impressions,
              campaignDays: formSelections.campaignDays,
              userFrequencyCap: formSelections.userFrequencyCap,
              country: formSelections.country || null,
              state: formSelections.state || null,
              province: formSelections.province || null,
              gender: formSelections.gender || null,
              employmentStatus: Array.isArray(formSelections.employmentStatus)
                ? formSelections.employmentStatus.join(", ")
                : formSelections.employmentStatus || null,
              adMediaType: formSelections.adMediaType,
              adContent: formSelections.adContent,
              adActionButtons: formSelections.adActionButtons,
              actionPhone: formSelections.actionDetails.phone || null,
              actionWhatsapp: formSelections.actionDetails.whatsapp || null,
              actionWebsite: formSelections.actionDetails.website || null,
              actionEmail: formSelections.actionDetails.email || null,
              costPerImpression,
              totalCost,
              adMedia: mediaUrlString,
              displayMutualButton: formSelections.displayMutualButton ?? true,
              productName: adType === "product_sales" ? formSelections.productName : null,
              productPrice: adType === "product_sales" ? parseFloat(formSelections.productPrice) : null,
              productCtaType: adType === "product_sales" ? formSelections.productCtaType : null,
              productCtaLink: adType === "product_sales" ? formSelections.productCtaLink : null,
            }
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      if (paymentMethod === "wallet") {
        alert("Success! Your Ad Campaign has been paid using your wallet balance and submitted for review.");
        window.location.href = "/user/statement";
      } else {
        alert("Redirecting to Paystack to complete payment for your Ad Campaign...");
        window.location.href = paymentData.authorization_url;
      }
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("❌ Submit error details:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err
      });
      alert(`An unexpected error occurred during submission: ${err?.message || JSON.stringify(err)}`);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {" "}
      <HeaderJoin />
      <main className={styles.pageWapper}>
        <div className={styles.pageWrapper}>
          <div className={styles.adFormContainer}>
            <h1>{steps[step]}</h1>

            {/* Step 0 */}
            {step === 0 && (
              <>
                <label>Ad Type:</label>
                <select
                  value={adType}
                  onChange={(e) => setAdType(e.target.value)}
                >
                  {Object.keys(adRates).map((key) => (
                    <option key={key} value={key}>
                      {key === "product_sales" ? "Product Sales" : key.charAt(0).toUpperCase() + key.slice(1)}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Step 1 */}
            {step === 1 &&
              categories.map((cat) => (
                <div key={cat} className={styles.dropdownContainer}>
                  <details>
                    <summary>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      <button
                        type="button"
                        onClick={() => handleTargetAll(cat)}
                      >
                        Target All
                      </button>
                    </summary>
                    {optionsMap[cat]?.map((item, i) => (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={formSelections[cat]?.includes(item)}
                          onChange={() => toggleSelection(cat, item)}
                        />
                        {item}
                      </label>
                    ))}
                  </details>
                </div>
              ))}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <LocationSelector
                  country={formSelections.country}
                  state={formSelections.state}
                  location={formSelections.province}
                  onChange={({ country, state, location }) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      country,
                      state,
                      province: location,
                    }))
                  }
                  cityLabel="Province"
                />
                <label>Gender:</label>
                <select
                  value={formSelections.gender}
                  onChange={(e) =>
                    setFormSelections({
                      ...formSelections,
                      gender: e.target.value,
                    })
                  }
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="both">Both</option>
                </select>
                
                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", marginBottom: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>Target Min Age</label>
                    <select
                      value={formSelections.ageRange[0]}
                      onChange={(e) => {
                        const min = parseInt(e.target.value);
                        const max = Math.max(min, formSelections.ageRange[1]);
                        setFormSelections({
                          ...formSelections,
                          ageRange: [min, max],
                        });
                      }}
                    >
                      {Array.from({ length: 83 }, (_, i) => i + 18).map((age) => (
                        <option key={age} value={age}>
                          {age} years
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>Target Max Age</label>
                    <select
                      value={formSelections.ageRange[1]}
                      onChange={(e) => {
                        const max = parseInt(e.target.value);
                        const min = Math.min(max, formSelections.ageRange[0]);
                        setFormSelections({
                          ...formSelections,
                          ageRange: [min, max],
                        });
                      }}
                    >
                      {Array.from({ length: 83 }, (_, i) => i + 18).map((age) => (
                        <option key={age} value={age}>
                          {age} years
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label>Employment Status (Select up to 4):</label>
                <div className={styles.checkboxGroup}>
                  {[
                    { value: "employed", label: "Employed" },
                    { value: "unemployed", label: "Unemployed" },
                    { value: "student", label: "Student" },
                    { value: "entrepreneur", label: "Entrepreneur" },
                    { value: "freelancer", label: "Freelancer" },
                    { value: "retired", label: "Retired" },
                  ].map((option) => {
                    const currentList = Array.isArray(formSelections.employmentStatus)
                      ? formSelections.employmentStatus
                      : formSelections.employmentStatus
                      ? (formSelections.employmentStatus as string).split(",").map((s) => s.trim())
                      : [];
                    const isChecked = currentList.includes(option.value);
                    return (
                      <label key={option.value} className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEmploymentStatus(option.value)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                <label htmlFor="impression-input" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Impressions
                </label>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                  <input
                    type="range"
                    id="impression"
                    min={1}
                    max={5000000}
                    step={1}
                    value={formSelections.impressions}
                    onChange={(e) =>
                      setFormSelections({
                        ...formSelections,
                        impressions: parseInt(e.target.value) || 1,
                      })
                    }
                    style={{ flex: 1, margin: 0 }}
                  />
                  <input
                    type="number"
                    id="impression-input"
                    min={1}
                    max={5000000}
                    value={formSelections.impressions}
                    onChange={(e) => {
                      let val = parseInt(e.target.value);
                      if (isNaN(val)) val = 1;
                      if (val > 5000000) val = 5000000;
                      setFormSelections({
                        ...formSelections,
                        impressions: val,
                      });
                    }}
                    style={{
                      width: "140px",
                      textAlign: "right",
                      padding: "0.5rem",
                      fontSize: "1rem",
                      border: "1px solid var(--card-border)",
                      borderRadius: "8px",
                      backgroundColor: "var(--sidebar-bg)",
                      color: "var(--foreground)"
                    }}
                  />
                </div>
                <label style={{ marginTop: "1rem", display: "block" }}>
                  Campaign Duration: {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={formSelections.campaignDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormSelections({
                      ...formSelections,
                      campaignDays: isNaN(val) || val < 1 ? 1 : val,
                    });
                  }}
                  className={styles.inputBox}
                  placeholder="e.g. 5"
                />
                <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
                  Daily Impression Cap: ~{Math.ceil(formSelections.impressions / formSelections.campaignDays).toLocaleString()} impressions/day
                </p>
                <label style={{ marginTop: "1rem", display: "block" }}>
                  Target Views Per User: {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formSelections.userFrequencyCap}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormSelections({
                      ...formSelections,
                      userFrequencyCap: isNaN(val) || val < 1 ? 1 : val,
                    });
                  }}
                  className={styles.inputBox}
                  placeholder="e.g. 3"
                />
                <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
                  A viewer can see this ad up to {formSelections.userFrequencyCap} time{formSelections.userFrequencyCap > 1 ? "s" : ""} before it stops showing for them.
                </p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem", fontStyle: "italic", lineHeight: "1.4" }}>
                  Tip: Ads shown 3 - 7 or more times are more likely to be remembered and increases likelihood of taking action than ads shown only once.
                </p>

                {/* Mutual Features */}
                <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
                  <label className={styles.checkboxLabel} style={{ fontWeight: "600" }}>
                    <input
                      type="checkbox"
                      checked={formSelections.displayMutualButton}
                      onChange={(e) =>
                        setFormSelections({
                          ...formSelections,
                          displayMutualButton: e.target.checked,
                        })
                      }
                    />
                    Display "Mutual+" button on this ad (allow viewers to add you as a mutual)
                  </label>

                  {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
                    <div style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem 1rem",
                      backgroundColor: "rgba(22, 163, 74, 0.1)",
                      border: "1px solid rgba(22, 163, 74, 0.2)",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "#16a34a",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem"
                    }}>
                      <strong style={{ fontWeight: "700" }}> Free Mutual Impressions Activated!</strong>
                      <span>Ticking this box will add your <strong>{userProfile.mutual_count} mutuals</strong> as free impressions to this campaign.</span>
                      <span style={{ fontSize: "0.8rem", opacity: 0.9 }}>
                        Total target: <strong>{(formSelections.impressions + userProfile.mutual_count).toLocaleString()} views</strong> (You only pay for {formSelections.impressions.toLocaleString()} views). Your {userProfile.mutual_count} mutuals will be targeted first, and your mutual count will be spent.
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <div className={styles.adCreativeSection}>
                {adType === "product_sales" && (
                  <>
                    <div className={styles.formGroup}>
                      <label>
                        Product Name{" "}
                        <span className={styles.charCount}>
                          {formSelections.productName.length}/80
                        </span>
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        value={formSelections.productName}
                        placeholder="Enter product name (max 80 characters)"
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productName: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Product Price (₦)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formSelections.productPrice}
                        placeholder="Enter product price in Naira"
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productPrice: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Primary CTA Button Text</label>
                      <select
                        value={formSelections.productCtaType}
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaType: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      >
                        <option value="Buy Now">Buy Now</option>
                        <option value="Shop">Shop</option>
                        <option value="Order">Order</option>
                        <option value="Visit Website">Visit Website</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Primary CTA Link (Secure HTTPS)</label>
                      <input
                        type="text"
                        value={formSelections.productCtaLink}
                        placeholder="e.g. https://yourstore.com/product or https://wa.me/..."
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaLink: e.target.value,
                          })
                        }
                        className={`${styles.inputBox} ${
                          formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://")
                            ? styles.inputError
                            : ""
                        }`}
                      />
                      {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && (
                        <p className={styles.error}>
                          The link must be a secure link starting with https://
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className={styles.formGroup}>
                  <label>Ad Content Type</label>
                  <select
                    value={formSelections.adMediaType}
                    onChange={(e) =>
                      setFormSelections({
                        ...formSelections,
                        adMediaType: e.target.value as AdMediaType,
                        adMediaFiles: [],
                      })
                    }
                    className={styles.inputBox}
                  >
                    <option value="">-- Select media type --</option>
                    <option value="text">Text Only</option>
                    <option value="image">Image(s) (Up to 4)</option>
                    <option value="video">Video Only (Max 1)</option>
                    <option value="mixed">Mixed (Up to 3 Images + 1 Video)</option>
                  </select>
                  {formSelections.adMediaType === "image" && (
                    <small className={styles.info}>
                      Max size: 6MB per image (JPG, PNG, etc). You can select up to 4 images.
                    </small>
                  )}
                  {formSelections.adMediaType === "video" && (
                    <small className={styles.info}>
                      Max size: 200MB • Max duration: 5mins • Format: Video formats. Select exactly 1 video.
                    </small>
                  )}
                  {formSelections.adMediaType === "mixed" && (
                    <small className={styles.info}>
                      Up to 3 images (max 6MB each) and exactly 1 video (max 200MB, 5mins).
                    </small>
                  )}
                </div>

                {formSelections.adMediaType && formSelections.adMediaType !== "text" && (
                  <div className={styles.formGroup}>
                    <label>Upload Files</label>
                    <input
                      type="file"
                      multiple={formSelections.adMediaType !== "video"}
                      accept={
                        formSelections.adMediaType === "video"
                          ? "video/*"
                          : formSelections.adMediaType === "image"
                          ? "image/*"
                          : "image/*,video/*"
                      }
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        const fileArray = Array.from(files);

                        // Separate images and videos
                        const images = fileArray.filter(f => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name));
                        const videos = fileArray.filter(f => f.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(f.name));

                        // Validation checks
                        if (formSelections.adMediaType === "image") {
                          if (videos.length > 0) {
                            alert("Only images are allowed for this type.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length > 4) {
                            alert("You can select up to 4 images only.");
                            e.target.value = "";
                            return;
                          }
                        } else if (formSelections.adMediaType === "video") {
                          if (images.length > 0) {
                            alert("Only videos are allowed for this type.");
                            e.target.value = "";
                            return;
                          }
                          if (videos.length > 1) {
                            alert("You can select only 1 video.");
                            e.target.value = "";
                            return;
                          }
                        } else if (formSelections.adMediaType === "mixed") {
                          if (videos.length > 1) {
                            alert("You can select at most 1 video.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length > 3) {
                            alert("You can select at most 3 images.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length + videos.length > 4) {
                            alert("Total number of files cannot exceed 4.");
                            e.target.value = "";
                            return;
                          }
                        }

                        // Size and video duration checks
                        for (const file of fileArray) {
                          const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
                          const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name);

                          if (isImage) {
                            if (file.size > 6 * 1024 * 1024) {
                              alert(`Image ${file.name} exceeds 6MB limit.`);
                              e.target.value = "";
                              return;
                            }
                          } else if (isVideo) {
                            if (file.size > 200 * 1024 * 1024) {
                              alert(`Video ${file.name} exceeds 200MB limit.`);
                              e.target.value = "";
                              return;
                            }
                            // check duration using promise
                            const durationOk = await new Promise<boolean>((resolve) => {
                              const videoEl = document.createElement("video");
                              videoEl.preload = "metadata";
                              videoEl.onloadedmetadata = () => {
                                resolve(videoEl.duration <= 300);
                              };
                              videoEl.onerror = () => resolve(false);
                              videoEl.src = URL.createObjectURL(file);
                            });
                            if (!durationOk) {
                              alert(`Video ${file.name} must be less than or equal to 5 minutes.`);
                              e.target.value = "";
                              return;
                            }
                          }
                        }

                        setFormSelections(prev => ({
                          ...prev,
                          adMediaFiles: fileArray
                        }));
                      }}
                      className={styles.inputBox}
                    />
                    {formSelections.adMediaFiles.length > 0 && (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        Selected: {formSelections.adMediaFiles.map(f => f.name).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>
                    {adType === "product_sales" ? "Product Description" : "Ad Message"}{" "}
                    <span className={styles.charCount}>
                      {formSelections.adContent.length}/{adType === "product_sales" ? 200 : 190}
                    </span>
                  </label>
                  <textarea
                    maxLength={adType === "product_sales" ? 200 : 190}
                    value={formSelections.adContent}
                    placeholder={adType === "product_sales" ? "Write product description here (no links allowed)" : "Write your ad message here (no links allowed)"}
                    onChange={(e) =>
                      setFormSelections({
                        ...formSelections,
                        adContent: e.target.value,
                      })
                    }
                    className={`${styles.inputBox} ${
                      containsLink(formSelections.adContent)
                        ? styles.inputError
                        : ""
                    }`}
                  />
                  {containsLink(formSelections.adContent) && (
                    <p className={styles.error}>
                      Links are not allowed in the ad content.
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label>Action Buttons (Max {adType === "product_sales" ? 2 : 3})</label>
                  {(["phone", "whatsapp", "website", "email"] as const).map(
                    (type) => {
                      const isSelected =
                        formSelections.adActionButtons.includes(type);
                      const placeholderMap = {
                        phone: "e.g. 2349031887771",
                        whatsapp: "e.g. 2349031887771",
                        email: "e.g. someone@example.com",
                        website: "e.g. https://yourwebsite.com",
                      };

                      const isEmail = type === "email";
                      const value = formSelections.actionDetails[type];
                      const isEmailInvalid =
                        isEmail &&
                        value &&
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

                      return (
                        <div key={type}>
                          <label>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const updated = [
                                  ...formSelections.adActionButtons,
                                ];
                                const maxButtons = adType === "product_sales" ? 2 : 3;
                                if (e.target.checked && updated.length < maxButtons)
                                  updated.push(type);
                                else if (!e.target.checked)
                                  updated.splice(updated.indexOf(type), 1);
                                setFormSelections({
                                  ...formSelections,
                                  adActionButtons: updated,
                                });
                              }}
                            />
                            {type.toUpperCase()}
                          </label>
                          {isSelected && (
                            <input
                              type={isEmail ? "email" : "text"}
                              placeholder={placeholderMap[type]}
                              value={value}
                              onChange={(e) =>
                                setFormSelections({
                                  ...formSelections,
                                  actionDetails: {
                                    ...formSelections.actionDetails,
                                    [type]: e.target.value,
                                  },
                                })
                              }
                              className={`${styles.inputBox} ${
                                isEmailInvalid ? styles.inputError : ""
                              }`}
                            />
                          )}
                          {isSelected && isEmailInvalid && (
                            <p className={styles.error}>Invalid email format</p>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <div className={styles.summaryContainer}>
                <div className={styles.summaryHeader}>
                  <h2 className={styles.summaryTitle}>Campaign summary</h2>
                  <p className={styles.summarySubtitle}>
                    Review your campaign configuration, targeting choices, and cost estimate before proceeding to the ad preview.
                  </p>
                </div>
                
                <div className={styles.summaryGrid}>
                  {/* Left Column: Configuration details */}
                  <div className={styles.summarySection}>
                    <h3 className={styles.sectionTitle}>Targeting details</h3>
                    <div className={styles.detailsList}>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Audience type</span>
                        <span className={styles.detailsVal}>
                          {formSelections.targetingAll ? "All users (Broad targeting)" : "Custom targeted audience"}
                        </span>
                      </div>
                      
                      {!formSelections.targetingAll && (
                        <>
                          {formSelections.gender && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Gender</span>
                              <span className={styles.detailsVal}>
                                {formSelections.gender.charAt(0).toUpperCase() + formSelections.gender.slice(1)}
                              </span>
                            </div>
                          )}
                          {formSelections.ageRange && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Age range</span>
                              <span className={styles.detailsVal}>
                                {formSelections.ageRange[0]} – {formSelections.ageRange[1]} years
                              </span>
                            </div>
                          )}
                          {(formSelections.country || formSelections.state || formSelections.province) && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Target location</span>
                              <span className={styles.detailsVal}>
                                {[formSelections.province, formSelections.state, formSelections.country]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </div>
                          )}
                          {formSelections.industry.length > 0 && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Industries</span>
                              <span className={styles.detailsVal}>{formSelections.industry.join(", ")}</span>
                            </div>
                          )}
                          {formSelections.interest.length > 0 && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Interests</span>
                              <span className={styles.detailsVal}>{formSelections.interest.join(", ")}</span>
                            </div>
                          )}
                          {formSelections.behavior.length > 0 && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Behaviors</span>
                              <span className={styles.detailsVal}>{formSelections.behavior.join(", ")}</span>
                            </div>
                          )}
                          {formSelections.lifestyle.length > 0 && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Lifestyles</span>
                              <span className={styles.detailsVal}>{formSelections.lifestyle.join(", ")}</span>
                            </div>
                          )}
                          {formSelections.personality.length > 0 && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Personality traits</span>
                              <span className={styles.detailsVal}>{formSelections.personality.join(", ")}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    <h3 className={styles.sectionTitle} style={{ marginTop: "2rem" }}>Delivery controls</h3>
                    <div className={styles.detailsList}>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Campaign duration</span>
                        <span className={styles.detailsVal}>
                          {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Frequency cap</span>
                        <span className={styles.detailsVal}>
                          {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""} per user
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Daily impression cap</span>
                        <span className={styles.detailsVal}>
                          ~{Math.ceil(
                            (formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0
                              ? formSelections.impressions + userProfile.mutual_count
                              : formSelections.impressions) / formSelections.campaignDays
                          ).toLocaleString()} impressions/day
                        </span>
                      </div>
                    </div>

                    {adType === "product_sales" && (
                      <>
                        <h3 className={styles.sectionTitle} style={{ marginTop: "2rem" }}>Product details</h3>
                        <div className={styles.detailsList}>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailsKey}>Product name</span>
                            <span className={styles.detailsVal}>{formSelections.productName}</span>
                          </div>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailsKey}>Product price</span>
                            <span className={styles.detailsVal}>{formatCurrency(formSelections.productPrice)}</span>
                          </div>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailsKey}>CTA action</span>
                            <span className={styles.detailsVal}>
                              {formSelections.productCtaType} &rarr; <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", wordBreak: "break-all" }}>{formSelections.productCtaLink}</span>
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Right Column: Pricing breakdown (Stripe Invoice/Receipt Card) */}
                  <div className={styles.costCard}>
                    <h3 className={styles.costCardTitle}>Pricing details</h3>
                    
                    <div className={styles.costRows}>
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Paid impressions</span>
                        <span className={styles.costVal}>
                          {formSelections.impressions.toLocaleString()} views
                        </span>
                      </div>
                      
                      {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
                        <div className={styles.costRow} style={{ color: "#16a34a" }}>
                          <span className={styles.costKey} style={{ color: "#16a34a" }}>Free mutual impressions</span>
                          <span className={styles.costVal}>
                            +{userProfile.mutual_count.toLocaleString()} views
                          </span>
                        </div>
                      )}
                      
                      <div className={styles.divider}></div>
                      
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Total target views</span>
                        <span className={styles.costVal} style={{ fontWeight: "600" }}>
                          {((formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0)
                            ? formSelections.impressions + userProfile.mutual_count
                            : formSelections.impressions).toLocaleString()} views
                        </span>
                      </div>
                      
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Cost per impression</span>
                        <span className={styles.costVal}>{formatCurrency(calculateTotalCostPerImpression())}</span>
                      </div>
                    </div>
                    
                    <div className={styles.totalSection}>
                      <span className={styles.totalLabel}>Total cost</span>
                      <span className={styles.totalAmount}>
                        {formatCurrency(calculateTotalCost())}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === 5 && (
              <>
                <h2 className={styles.centeredHeading}>Preview Your Ad</h2>

                <AdPreviewCard
                  mediaFiles={formSelections.adMediaFiles}
                  mediaType={formSelections.adMediaType}
                  adContent={formSelections.adContent}
                  actionButtons={formSelections.adActionButtons}
                  actionDetails={formSelections.actionDetails}
                  displayMutualButton={formSelections.displayMutualButton}
                  adType={adType}
                  productName={formSelections.productName}
                  productPrice={formSelections.productPrice}
                  productCtaType={formSelections.productCtaType}
                  productCtaLink={formSelections.productCtaLink}
                />
                <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem", padding: "1.5rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
                  <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: "700", fontSize: "0.9rem" }}>Payment Method</label>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 1rem", border: "1px solid var(--card-border)", borderRadius: "8px", backgroundColor: paymentMethod === "card" ? "rgba(255,255,255,0.05)" : "transparent" }}>
                      <input type="radio" name="pay_method" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} />
                      <span>Paystack (Card/Bank)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 1rem", border: "1px solid var(--card-border)", borderRadius: "8px", backgroundColor: paymentMethod === "wallet" ? "rgba(255,255,255,0.05)" : "transparent" }}>
                      <input type="radio" name="pay_method" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} />
                      <span>Wallet Balance ({formatCurrency(userProfile?.balance ?? 0)})</span>
                    </label>
                  </div>
                </div>

                <button
                  className={styles.submitButton}
                  onClick={submitAd}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting Ad..." : "Submit Ad For Review"}
                </button>
              </>
            )}

            <div className={styles.buttonGroup}>
              {step > 0 && (
                <button onClick={() => setStep(step - 1)}>Back</button>
              )}
              {step < 5 && (
                <button
                  onClick={() => {
                    if (step === 3 && !validateStep3()) {
                      alert(
                        adType === "product_sales"
                          ? "Please complete all required fields in Ad Creative. Note: Product name (max 80 chars), price (> 0), description (max 200 chars, no links), and secure CTA link (starts with https://) are required. Max 2 secondary action buttons."
                          : "Please complete all required fields in Ad Creative."
                      );
                      return;
                    }
                    setStep(step + 1);
                  }}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

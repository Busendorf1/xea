"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import { Timestamp } from "next/dist/server/lib/cache-handlers/types";
import { useRouter } from "next/navigation";
import Footer from "../Footer/page";
import HeaderJoin from "../HeaderJoin/page";
import LocationSelector from "../LocationSelector";

const industries = [
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
];

const interests = [
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
];

const behaviors = [
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
];

const lifestyles = [
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
];

const personalityTraits = [
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
];
interface Props {
  email: string;
}

interface UserProfileData {
  id: string;
  email: string;
  username: string;
  dob: string;
  country: string;
  state: string;
  location: string;
  passphrase: string;
  industry: string[];
  interest: string[];
  behavior: string[];
  lifestyle: string[];
  personality: string[];
  gender: string;
  employment: string;
  phone: string;
  intlTravel: string;
  localTravel: string;
  firstName: string;
  lastName: string;
  bio: string;
  profileImage: string;
  lastUpdated: Timestamp;
  business_name?: string;
  has_updated_profile?: boolean;
}

export default function Update({ email }: Props) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [openDropdowns, setOpenDropdowns] = useState({
    industry: false,
    interest: false,
    behavior: false,
    lifestyle: false,
    personality: false,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const router = useRouter();

  const toggleDropdown = (key: keyof typeof openDropdowns) => {
    setOpenDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) {
          setStatus("❌ Failed to fetch profile.");
          setLoading(false);
          return;
        }
        const data = await res.json();

        // Ensure arrays for multi-selects
        const arrayFields = [
          "industry",
          "interest",
          "behavior",
          "lifestyle",
          "personality",
        ];
        arrayFields.forEach((field) => {
          if (typeof data[field] === "string") {
            data[field] = data[field]?.split(",").map((v: string) => v.trim());
          } else if (!Array.isArray(data[field])) {
            data[field] = [];
          }
        });

        setProfile(data);
      } catch (e) {
        console.error("Error fetching profile:", e);
        setStatus("❌ Failed to fetch profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [email]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    if (!profile) return;
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      const current = (profile as any)[name] || [];
      const updated = checked
        ? [...current, value]
        : current.filter((v: string) => v !== value);
      setProfile({ ...profile, [name]: updated });
    } else {
      setProfile({ ...profile, [name]: value });
    }
  };

  const handleUpdate = async () => {
    if (!profile) return;

    setLoading(true);
    setStatus("⏳ Checking update eligibility...");

    // 1. Fetch current timestamp & update status via secure API
    let latestUser;
    try {
      const resUser = await fetch("/api/profile");
      if (!resUser.ok) {
        throw new Error("Failed to fetch profile");
      }
      latestUser = await resUser.json();
    } catch (fetchErr: any) {
      console.error("❌ Failed to check timestamp:", fetchErr.message);
      setStatus("❌ Failed to verify update eligibility.");
      setLoading(false);
      return;
    }

    const now = new Date();
    if (latestUser.has_updated_profile) {
      const lastUpdated = new Date(latestUser.lastUpdated || 0);
      const diffDays =
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays < 30) {
        console.warn(
          "❌ Update blocked: Only",
          Math.floor(diffDays),
          "days passed"
        );
        setStatus("⚠️ You can only update your profile once every 30 days.");
        setLoading(false);
        return;
      }
    }

    // 2. Upload new image if provided
    let imageUrl = profile.profileImage;

    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}-${profile.email}.${fileExt}`;
      const filePath = `public/${fileName}`;

      // Remove old image (optional)
      if (profile.profileImage?.includes("storage.supabase")) {
        const parts = profile.profileImage.split("/");
        const existingPath = `${parts.at(-2)}/${parts.at(-1)}`;
        await supabase.storage.from("dp").remove([existingPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("dp")
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("❌ Image upload failed:", uploadError.message);
        setStatus("❌ Failed to upload profile image.");
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("dp")
        .getPublicUrl(filePath);
      imageUrl = publicUrlData?.publicUrl || imageUrl;
    }

    // 3. Prepare payload
    const payload = {
      ...profile,
      profileImage: imageUrl,
      has_updated_profile: true,
      industry: profile.industry,
      interest: profile.interest,
      behavior: profile.behavior,
      lifestyle: profile.lifestyle,
      personality: profile.personality,
    };

    // 4. Update Supabase via secure API
    try {
      const response = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Update rejected by API");
      }
    } catch (updateError: any) {
      console.error("❌ Update failed:", updateError.message);
      setStatus(`❌ Update failed: ${updateError.message}`);
      setLoading(false);
      return;
    }

    // 5. Reset state and show success
    setStatus("✅ Profile updated successfully. Redirecting...");
    setImageFile(null); // Reset image
    setProfile(null); // Optional: Clear form or re-fetch
    setLoading(false);

    // Optional delay for user to see the message
    setTimeout(() => {
      router.push("/user/dashboard");
    }, 1500);
  };

  const renderDropdown = (
    label: string,
    name: "industry" | "interest" | "behavior" | "lifestyle" | "personality",
    options: string[]
  ) => (
    <div className={styles.dropdownContainer}>
      <div
        className={styles.dropdownHeader}
        onClick={() => toggleDropdown(name)}
      >
        <span>Select {label}</span>
        <span>{openDropdowns[name] ? "▲" : "▼"}</span>
      </div>
      {openDropdowns[name] && (
        <div className={styles.checkboxGroup}>
          {options.map((opt) => (
            <label key={opt}>
              <input
                type="checkbox"
                name={name}
                value={opt}
                checked={profile?.[name]?.includes(opt)}
                onChange={handleChange}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) return <p>Loading profile...</p>;
  if (!profile) return <p>Profile not found.</p>;

  return (
    <>
    <HeaderJoin />
    <div className={styles.profileContainer}>
      <h1 className={styles.update}>Update Profile</h1>
      {status && <p className={styles.status}>{status}</p>}

      {/* Section 1: Personal & Contact Info */}
      <div className={styles.formSection}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Username</label>
            <input
              name="username"
              placeholder="Username (Email)"
              value={profile.username || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Date of Birth</label>
            <input
              type="date"
              name="dob"
              value={profile.dob || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>First Name</label>
            <input
              name="firstName"
              placeholder="First Name"
              value={profile.firstName || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Last Name</label>
            <input
              name="lastName"
              placeholder="Last Name"
              value={profile.lastName || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Business Name (Optional)</label>
            <input
              name="business_name"
              placeholder="Business Name"
              maxLength={25}
              value={profile.business_name || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Phone Number</label>
            <input
              name="phone"
              type="tel"
              placeholder="Phone"
              value={profile.phone || ""}
              onChange={handleChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Email Address</label>
            <input
              name="email"
              type="email"
              placeholder="Email"
              value={profile.email || ""}
              onChange={handleChange}
            />
          </div>

          <LocationSelector
            country={profile.country || ""}
            state={profile.state || ""}
            location={profile.location || ""}
            onChange={({ country, state, location }) =>
              setProfile((prev) => prev ? ({ ...prev, country, state, location }) : null)
            }
            showLabels={true}
            groupClass={styles.formGroup}
            cityGroupClass={styles.formGroup}
            cityLabel="City/Location"
          />

          <div className={styles.formGroup}>
            <label>Passphrase</label>
            <input
              name="passphrase"
              placeholder="Passphrase"
              value={profile.passphrase || ""}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Gender</label>
            <select name="gender" value={profile.gender || ""} onChange={handleChange}>
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="nonbinary">Non-Binary</option>
              <option value="prefer_not">Prefer not to say</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Employment Status</label>
            <select
              name="employment"
              value={profile.employment || ""}
              onChange={handleChange}
            >
              <option value="">Select Employment</option>
              <option value="employed">Employed</option>
              <option value="student">Student</option>
              <option value="unemployed">Unemployed</option>
              <option value="freelancer">Freelancer</option>
              <option value="entrepreneur">Entrepreneur</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Preferences & Profile Details */}
      <div className={styles.formSection}>
        <h2>Preferences & Profile Details</h2>
        <div className={styles.formGrid}>
          <label>International Traveller?</label>
          <select
            name="intlTravel"
            value={profile.intlTravel || "no"}
            onChange={handleChange}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>

          <label>Local Traveller by Air?</label>
          <select
            name="localTravel"
            value={profile.localTravel || "no"}
            onChange={handleChange}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>

          <label className={styles.fileUpload}>
            Upload Profile Picture
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImageFile(file);
              }}
            />
          </label>
        </div>

        {/* Dropdowns: Keep them full width */}
        {renderDropdown("Industries", "industry", industries)}
        {renderDropdown("Interests", "interest", interests)}
        {renderDropdown("Behaviors", "behavior", behaviors)}
        {renderDropdown("Lifestyles", "lifestyle", lifestyles)}
        {renderDropdown("Personality Traits", "personality", personalityTraits)}

        <textarea
          name="bio"
          placeholder="Short Bio (max 90 characters)"
          maxLength={90}
          value={profile.bio || ""}
          onChange={handleChange}
          className={styles.textbo}
        />
      </div>
      {profile && !profile.has_updated_profile && (
        <p style={{ fontSize: "0.8rem", color: "#d97706", marginTop: "1rem", marginBottom: "0.5rem", textAlign: "center", fontWeight: "600" }}>
          Note: After this initial update, you can only update your profile once every 30 days.
        </p>
      )}
      <button
        className={styles.buttonGroup}
        onClick={handleUpdate}
        disabled={loading}
      >
        {loading ? "Updating..." : "Update"}
      </button>
    </div>
    <Footer />
    </>
  );
}

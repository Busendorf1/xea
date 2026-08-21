const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
let supabaseUrl = "";
let supabaseKey = "";

try {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
        if (key === "NEXT_PUBLIC_SUPABASE_URL") {
          supabaseUrl = value;
        } else if (key === "SUPABASE_SERVICE_ROLE_KEY" || (!supabaseKey && key === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
          supabaseKey = value;
        }
      }
    }
  });
} catch (e) {
  console.error("Error reading .env.local:", e.message);
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// DATA FIXTURES FOR REALISTIC SIMULATION
// ==========================================

const COUNTRIES = [
  { name: "Nigeria", states: ["Lagos", "Abuja", "Rivers", "Oyo", "Kano", "Enugu"] },
  { name: "United States", states: ["California", "New York", "Texas", "Florida", "Washington"] },
  { name: "United Kingdom", states: ["Greater London", "Manchester", "West Midlands", "Scotland"] },
  { name: "Ghana", states: ["Greater Accra", "Ashanti", "Central", "Western"] },
  { name: "Kenya", states: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"] },
  { name: "South Africa", states: ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape"] },
  { name: "Canada", states: ["Ontario", "British Columbia", "Quebec", "Alberta"] },
];

const INTERESTS = [
  "Technology", "Artificial Intelligence", "E-Commerce", "Real Estate",
  "Fashion & Style", "Cryptocurrency", "Finance & Investing", "Automobile",
  "Health & Fitness", "Travel & Leisure", "Food & Dining", "Education",
  "Gaming", "Entertainment", "Music & Arts", "Business & Startups"
];

const FIRST_NAMES = [
  "Alexander", "Sophia", "David", "Amara", "Marcus", "Elena", "Tariq", "Chioma",
  "Ethan", "Zainab", "Liam", "Fatima", "Oluwaseun", "Kofi", "Amina", "Gabriel",
  "Isabella", "Emeka", "Aisha", "Noah", "Chloe", "Jamal", "Ngozi", "Lucas",
  "Kwame", "Maya", "Daniel", "Grace", "Ibrahim", "Hannah", "Victor", "Blessing"
];

const LAST_NAMES = [
  "Adeyemi", "Smith", "Okonkwo", "Johnson", "Mensah", "Okafor", "Williams", "Diallo",
  "Brown", "Nwosu", "Taylor", "Suleiman", "Davies", "Balogun", "Kamau", "Miller",
  "Wilson", "Eze", "Anderson", "Abubakar", "Thomas", "Adeleke", "Jackson", "Mutua"
];

const SAMPLE_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&h=150&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces",
];

// Verified high-performance public CDN video streams (fast startup)
const SAMPLE_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
];

// High-resolution commercial product & lifestyle photos
const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop&q=80"
];

const AD_TEMPLATES = [
  {
    type: "video",
    title: "Next-Gen Quantum Cloud Computing",
    content: "Deploy high-throughput containerized microservices with zero configuration. Scale effortlessly to millions of concurrent requests worldwide with instant edge caching.",
    interest: ["Technology", "Artificial Intelligence", "Business & Startups"],
    actionButtons: ["action_website", "action_email"],
    cpi: 75.0,
  },
  {
    type: "product_sales",
    title: "Aura Sound Pro Wireless Earbuds",
    productName: "Aura ANC Spatial Earbuds",
    productPrice: 45000,
    ctaType: "Order Now",
    content: "Experience studio-grade active noise cancellation with 48-hour battery longevity and seamless device pairing. Limited batch discount available now.",
    interest: ["Technology", "Entertainment", "Music & Arts"],
    actionButtons: ["action_whatsapp", "action_website"],
    cpi: 60.0,
  },
  {
    type: "carousel",
    title: "Luxury Waterfront Residences in Eko Atlantic",
    content: "Step into ultra-modern 3 & 4 bedroom penthouses featuring panoramic ocean vistas, private infinity pools, and 24/7 smart security. Flexible payment plans available.",
    interest: ["Real Estate", "Finance & Investing", "Lifestyle"],
    actionButtons: ["action_phone", "action_whatsapp", "action_website"],
    cpi: 120.0,
  },
  {
    type: "product_sales",
    title: "Vanguard Titan Chronograph Watch",
    productName: "Titan Ceramic Automatic Watch",
    productPrice: 185000,
    ctaType: "Shop Collection",
    content: "Handcrafted sapphire crystal dial with Swiss automatic movement. Engineered for elegance, durability, and timeless prestige.",
    interest: ["Fashion & Style", "Lifestyle"],
    actionButtons: ["action_website", "action_whatsapp"],
    cpi: 90.0,
  },
  {
    type: "video",
    title: "Global FinTech Liquidity & FX Exchange",
    content: "Convert, send, and settle international multi-currency transfers across 60+ countries in under 3 seconds. Zero hidden FX markups and institutional security.",
    interest: ["Finance & Investing", "Cryptocurrency", "Technology"],
    actionButtons: ["action_ios", "action_android", "action_website"],
    cpi: 110.0,
  },
  {
    type: "single_image",
    title: "Elite Pro Carbon Fiber Running Footwear",
    content: "Designed in collaboration with Olympic marathon champions. Energy-return responsive foam soles that propel your stride forward with every step.",
    interest: ["Health & Fitness", "Fashion & Style"],
    actionButtons: ["action_website", "action_whatsapp"],
    cpi: 45.0,
  },
  {
    type: "carousel",
    title: "Electric Hyper-SUV: The Future of Mobility",
    content: "Dual-motor all-wheel drive generating 750 horsepower. Accelerates from 0 to 100 km/h in 2.8 seconds with over 600km single-charge range.",
    interest: ["Automobile", "Technology"],
    actionButtons: ["action_website", "action_phone"],
    cpi: 150.0,
  },
  {
    type: "product_sales",
    title: "Artisanal Single-Origin Arabica Coffee Roast",
    productName: "Signature Dark Roast Blend (1kg)",
    productPrice: 14500,
    ctaType: "Buy Now",
    content: "Freshly roasted specialty beans with rich dark chocolate and toasted hazelnut notes. Sustainably sourced from highland family farms.",
    interest: ["Food & Dining", "Lifestyle"],
    actionButtons: ["action_whatsapp", "action_website"],
    cpi: 35.0,
  }
];

const HIGHLIGHT_TEMPLATES = [
  {
    title: "Global Venture Funding Surges in AI Infrastructure",
    category: "Technology",
    content: "Institutional investors deployed over $28B in specialized generative hardware and inference pipelines during the first half of the fiscal year.",
  },
  {
    title: "Central Bank Announces Real-Time Settlement Upgrade",
    category: "Finance & Investing",
    content: "Commercial banks and licensed fintechs transition to sub-second ISO 20022 clearing standards across digital payment gateways.",
  },
  {
    title: "Commercial Real Estate Yields Rebound in Prime Metros",
    category: "Real Estate",
    content: "Grade-A office and luxury residential developments report 14.8% annualized capitalization rates amidst growing multinational occupancy.",
  },
  {
    title: "Solar Grid Adoption Doubles Across Emerging Markets",
    category: "Business & Startups",
    content: "Decentralized micro-grids and battery energy storage solutions achieve parity with conventional industrial energy tariffs.",
  },
  {
    title: "Cross-Border E-Commerce Logistical Hubs Expand",
    category: "E-Commerce",
    content: "Automated fulfillment centers reduce international cargo delivery windows from 14 days down to 48 hours.",
  },
];

// Helper: Pick random item
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
};

// ==========================================
// SEEDING EXECUTION
// ==========================================

async function seedSimulationSuite() {
  console.log("🚀 Starting High-Traffic Simulation Suite Seeder...");

  // 1. Generate and Seed 100 Simulated User Accounts
  console.log("\n👤 1. Generating 100 Diverse Simulated User Accounts...");
  const simulatedUsers = [];

  for (let i = 1; i <= 100; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const countryObj = pick(COUNTRIES);
    const state = pick(countryObj.states);
    const email = `sim_user_${i}_${firstName.toLowerCase()}@sim.paayh.com`;
    const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}${i}`;
    const userInterests = pickN(INTERESTS, Math.floor(Math.random() * 3) + 2);
    const avatar = pick(SAMPLE_AVATARS);
    const balance = Math.floor(Math.random() * 50000) + 1500;
    const isMonetized = Math.random() > 0.35;
    const clicks = isMonetized ? Math.floor(Math.random() * 800) + 300 : Math.floor(Math.random() * 200);

    simulatedUsers.push({
      email,
      username,
      firstName,
      lastName,
      dob: "1996-08-20",
      phone: `+23480${Math.floor(10000000 + Math.random() * 90000000)}`,
      profileImage: avatar,
      bio: `Digital enthusiast, creator, and investor interested in ${userInterests[0]} & ${userInterests[1]}.`,
      interest: userInterests,
      industry: [userInterests[0]],
      country: countryObj.name,
      state,
      location: `${state}, ${countryObj.name}`,
      monetized: isMonetized ? "yes" : "no",
      monetization_clicks: clicks,
      balance,
      mutual_count: Math.floor(Math.random() * 45),
      created_at: new Date(Date.now() - Math.floor(Math.random() * 60) * 86400000).toISOString(),
      last_active_at: new Date().toISOString(),
    });
  }

  // Batch insert users in chunks of 25
  for (let i = 0; i < simulatedUsers.length; i += 25) {
    const chunk = simulatedUsers.slice(i, i + 25);
    const { error } = await supabase.from("users").upsert(chunk, { onConflict: "email" });
    if (error) {
      console.warn("⚠️ Warning inserting user chunk:", error.message);
    }
  }
  console.log(`✅ Successfully seeded ${simulatedUsers.length} simulated user profiles.`);

  // 2. Generate and Seed 250 Rich Advertisements (Videos, Carousels, Product Sales)
  console.log("\n📢 2. Generating 250 Diverse Active Advertisements...");
  const simulatedAds = [];

  for (let i = 1; i <= 250; i++) {
    const template = pick(AD_TEMPLATES);
    const publisher = pick(simulatedUsers);
    const countryObj = pick(COUNTRIES);
    const state = pick(countryObj.states);

    let adMedia = "";
    let hlsUrl = null;

    if (template.type === "video") {
      adMedia = pick(SAMPLE_VIDEOS);
    } else if (template.type === "carousel") {
      const mediaList = [pick(SAMPLE_VIDEOS), pick(SAMPLE_IMAGES), pick(SAMPLE_IMAGES)];
      adMedia = mediaList.join(", ");
    } else if (template.type === "product_sales") {
      const isVideoProduct = Math.random() > 0.5;
      adMedia = isVideoProduct ? pick(SAMPLE_VIDEOS) : pick(SAMPLE_IMAGES);
    } else {
      adMedia = pick(SAMPLE_IMAGES);
    }

    const campaignDays = pick([7, 14, 30, 60]);
    const targetImpressions = pick([5000, 10000, 25000, 50000, 100000]);
    const currentImpressions = Math.floor(Math.random() * (targetImpressions * 0.4));

    simulatedAds.push({
      user_email: publisher.email,
      ad_content: `${template.title} — ${template.content}`,
      ad_media: adMedia,
      ad_type: template.type === "product_sales" ? "product_sales" : "standard",
      product_name: template.productName || null,
      product_price: template.productPrice || null,
      product_cta_type: template.ctaType || (template.type === "product_sales" ? "Buy Now" : null),
      product_cta_link: "https://paayh.com",
      action_website: "https://paayh.com",
      action_whatsapp: "+2348012345678",
      action_phone: "+2348012345678",
      action_email: publisher.email,
      action_ios: "https://apps.apple.com",
      action_android: "https://play.google.com",
      cost_per_impression: template.cpi,
      interest: template.interest,
      country: countryObj.name,
      state: state,
      campaign_days: campaignDays,
      impressions: targetImpressions,
      impression_count: currentImpressions,
      user_frequency_cap: pick([1, 2, 3, 5]),
      display_mutual_button: Math.random() > 0.4,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 20) * 86400000).toISOString(),
    });
  }

  // Batch insert ads in chunks of 25 into 'adds' table
  for (let i = 0; i < simulatedAds.length; i += 25) {
    const chunk = simulatedAds.slice(i, i + 25);
    const { error } = await supabase.from("adds").insert(chunk);
    if (error) {
      console.warn("⚠️ Warning inserting ad chunk into adds table:", error.message);
    }
  }
  console.log(`✅ Successfully seeded ${simulatedAds.length} active advertisements into 'adds' table.`);

  // 3. Generate and Seed 60 Business Highlights
  console.log("\n📰 3. Generating 60 Daily Business Highlights...");
  const simulatedHighlights = [];

  for (let i = 1; i <= 60; i++) {
    const template = pick(HIGHLIGHT_TEMPLATES);
    const publisher = pick(simulatedUsers);
    const isBidded = Math.random() > 0.25;
    const bidPrice = isBidded ? Math.floor(Math.random() * 15000) + 2000 : 0;
    const coverImage = pick(SAMPLE_IMAGES);

    simulatedHighlights.push({
      user_email: publisher.email,
      title: `${template.title} (Insight #${i})`,
      content: template.content,
      image_url: coverImage,
      interest: template.category,
      is_bidded: isBidded,
      bid_price: bidPrice,
      campaign_days: pick([3, 7, 14]),
      created_at: new Date(Date.now() - Math.floor(Math.random() * 5) * 86400000).toISOString(),
    });
  }

  for (let i = 0; i < simulatedHighlights.length; i += 20) {
    const chunk = simulatedHighlights.slice(i, i + 20);
    const { error } = await supabase.from("newsactive").insert(chunk);
    if (error) {
      console.warn("⚠️ Warning inserting highlights chunk:", error.message);
    }
  }
  console.log(`✅ Successfully seeded ${simulatedHighlights.length} daily business highlights.`);

  console.log("\n🎉 Simulation Suite Database Seeding Complete!");
  console.log("--------------------------------------------------");
  console.log(`• Profiles:   ${simulatedUsers.length}`);
  console.log(`• Ads:        ${simulatedAds.length} (Videos, Carousels, Product Sales)`);
  console.log(`• Highlights: ${simulatedHighlights.length}`);
  console.log("--------------------------------------------------\n");
}

seedSimulationSuite().catch((err) => {
  console.error("❌ Fatal error seeding simulation data:", err);
  process.exit(1);
});

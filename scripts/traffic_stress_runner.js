const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
let auth0Secret = "default-development-secret-key-32-chars";
let appUrl = "http://localhost:3000";

try {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
        if (key === "AUTH0_SECRET") {
          auth0Secret = value;
        } else if (key === "NEXT_PUBLIC_APP_URL" || key === "APP_URL") {
          appUrl = value;
        }
      }
    }
  });
} catch (e) {}

// Command line argument parsing: --concurrency, --duration, --url
const args = process.argv.slice(2);
let concurrency = 5; // Default 5 concurrent users
let durationSeconds = 300; // Default 5 minutes (0 = infinite / multi-day)
let targetBaseUrl = appUrl.startsWith("http") ? appUrl : `http://${appUrl}`;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--concurrency" && args[i + 1]) {
    concurrency = parseInt(args[i + 1], 10);
  } else if (args[i] === "--duration" && args[i + 1]) {
    durationSeconds = parseInt(args[i + 1], 10);
  } else if (args[i] === "--url" && args[i + 1]) {
    targetBaseUrl = args[i + 1];
  }
}

// Telemetry Metrics
const metrics = {
  totalRequests: 0,
  feedRequests: 0,
  earnRequests: 0,
  seenRequests: 0,
  highlightRequests: 0,
  monetizeRequests: 0,
  successCount: 0,
  errorCount: 0,
  totalLatencyMs: 0,
  latencies: [],
  startTime: Date.now(),
};

// Generate PoV Token matching server crypto validation
function generatePoVToken(adId, userId, servedAt) {
  const payload = `${adId}:${userId}:${servedAt}`;
  return crypto.createHmac("sha256", auth0Secret).update(payload).digest("hex");
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Simulated User Session Agent
async function runUserSession(agentId) {
  const simulatedEmail = `sim_user_${(agentId % 100) + 1}@sim.paayh.com`;
  const headers = {
    "Content-Type": "application/json",
    "x-simulated-user": simulatedEmail,
  };

  console.log(`🤖 Agent #${agentId} started session for: ${simulatedEmail}`);

  let lastFeedCursor = null;

  while (true) {
    // 1. Fetch Feed (Infinite Scroll simulation)
    try {
      const feedStart = Date.now();
      const feedUrl = `${targetBaseUrl}/api/feed?interests=Technology,Finance&limit=10${lastFeedCursor ? `&cursor=${lastFeedCursor}` : ""}`;
      
      const feedRes = await fetch(feedUrl, { headers });
      const feedDuration = Date.now() - feedStart;
      recordRequest("feed", feedDuration, feedRes.ok);

      if (feedRes.ok) {
        const feedData = await feedRes.json();
        const ads = feedData.ads || feedData.data || [];
        
        if (feedData.nextCursor) {
          lastFeedCursor = feedData.nextCursor;
        }

        // Simulate viewing and scrolling through ads in this page
        for (const ad of ads.slice(0, 3)) {
          // Dwell / scroll delay
          await delay(1200 + Math.random() * 800);

          // Record Seen
          const seenStart = Date.now();
          const seenRes = await fetch(`${targetBaseUrl}/api/seen`, {
            method: "POST",
            headers,
            body: JSON.stringify({ adId: ad.id }),
          });
          recordRequest("seen", Date.now() - seenStart, seenRes.ok);

          // 30% chance to watch full duration and claim earn payout
          if (Math.random() < 0.4) {
            const servedAt = (Date.now() - 17000).toString(); // Simulated 17s watch time
            const token = generatePoVToken(ad.id, simulatedEmail, servedAt);

            const earnStart = Date.now();
            const earnRes = await fetch(`${targetBaseUrl}/api/earn`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                adId: ad.id,
                token,
                servedAt,
                type: "earn",
              }),
            });
            recordRequest("earn", Date.now() - earnStart, earnRes.ok);
          }
        }
      }
    } catch (err) {
      metrics.errorCount++;
    }

    // 2. Fetch Highlights
    try {
      const hlStart = Date.now();
      const hlRes = await fetch(`${targetBaseUrl}/api/highlights?interests=Technology`, { headers });
      recordRequest("highlight", Date.now() - hlStart, hlRes.ok);
    } catch (e) {
      metrics.errorCount++;
    }

    // 3. Check Monetize Status
    try {
      const monStart = Date.now();
      const monRes = await fetch(`${targetBaseUrl}/api/monetize`, { headers });
      recordRequest("monetize", Date.now() - monStart, monRes.ok);
    } catch (e) {
      metrics.errorCount++;
    }

    // Natural reading cadence pause (2 to 5 seconds before next scroll batch)
    await delay(2000 + Math.random() * 3000);
  }
}

function recordRequest(type, latencyMs, isSuccess) {
  metrics.totalRequests++;
  metrics.totalLatencyMs += latencyMs;
  metrics.latencies.push(latencyMs);
  if (metrics.latencies.length > 2000) metrics.latencies.shift();

  if (type === "feed") metrics.feedRequests++;
  else if (type === "earn") metrics.earnRequests++;
  else if (type === "seen") metrics.seenRequests++;
  else if (type === "highlight") metrics.highlightRequests++;
  else if (type === "monetize") metrics.monetizeRequests++;

  if (isSuccess) metrics.successCount++;
  else metrics.errorCount++;
}

// Telemetry Reporting Loop (Prints every 10 seconds)
function startTelemetryReporter() {
  setInterval(() => {
    const elapsedSec = Math.max(1, (Date.now() - metrics.startTime) / 1000);
    const rps = (metrics.totalRequests / elapsedSec).toFixed(1);
    const avgLatency = metrics.totalRequests > 0 ? (metrics.totalLatencyMs / metrics.totalRequests).toFixed(1) : 0;
    
    // Calculate P95 latency
    const sorted = [...metrics.latencies].sort((a, b) => a - b);
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const successRate = metrics.totalRequests > 0 ? ((metrics.successCount / metrics.totalRequests) * 100).toFixed(1) : 100;

    console.log(
      `📊 [${new Date().toLocaleTimeString()}] ` +
      `Reqs: ${metrics.totalRequests} | ` +
      `RPS: ${rps}/s | ` +
      `Avg: ${avgLatency}ms | ` +
      `P95: ${p95}ms | ` +
      `Success: ${successRate}% | ` +
      `Feed: ${metrics.feedRequests} | ` +
      `Earn: ${metrics.earnRequests} | ` +
      `Seen: ${metrics.seenRequests}`
    );
  }, 10000);
}

// Master Stress Runner
async function main() {
  console.log("==========================================================");
  console.log("⚡ HIGH-TRAFFIC & SCROLL STRESS RUNNER INITIALIZED");
  console.log(`• Target URL:    ${targetBaseUrl}`);
  console.log(`• Concurrency:   ${concurrency} concurrent virtual users`);
  console.log(`• Duration:      ${durationSeconds > 0 ? `${durationSeconds}s` : "Continuous / Multi-Day Mode"}`);
  console.log("==========================================================\n");

  startTelemetryReporter();

  // Spawn concurrent user sessions
  for (let i = 1; i <= concurrency; i++) {
    runUserSession(i);
    await delay(300); // Stagger agent starts
  }

  if (durationSeconds > 0) {
    setTimeout(() => {
      console.log("\n🏁 Scheduled stress test duration completed. Telemetry Summary:");
      console.log("----------------------------------------------------------");
      console.log(`• Total Requests:  ${metrics.totalRequests}`);
      console.log(`• Success Rate:    ${((metrics.successCount / Math.max(1, metrics.totalRequests)) * 100).toFixed(2)}%`);
      console.log(`• Avg Latency:     ${(metrics.totalLatencyMs / Math.max(1, metrics.totalRequests)).toFixed(1)}ms`);
      console.log("----------------------------------------------------------\n");
      process.exit(0);
    }, durationSeconds * 1000);
  }
}

main().catch(console.error);

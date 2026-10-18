import http from "http";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

console.log("🚀 Starting Standalone BullMQ Worker Process...");
console.log(`📡 Redis Host: ${process.env.REDIS_HOST || "Not configured"}`);

let shutdownFn: (() => Promise<void>) | null = null;

let queueDepthInterval: NodeJS.Timeout | null = null;

// Import the worker file dynamically to avoid ES6 hoisting issue
async function startWorker() {
  const workerModule = await import("../lib/worker");
  shutdownFn = workerModule.shutdownWorkers;
  console.log("⚡ Queue workers successfully booted. Listening to Upstash Redis...");

  // Monitor BullMQ queue depth and log autoscaling advice when backpressure builds up
  const { feedQueue, paymentQueue, campaignsQueue } = await import("../lib/queue");
  queueDepthInterval = setInterval(async () => {
    try {
      const [feedWaiting, paymentWaiting, campaignsWaiting] = await Promise.all([
        feedQueue.getWaitingCount().catch(() => 0),
        paymentQueue.getWaitingCount().catch(() => 0),
        campaignsQueue.getWaitingCount().catch(() => 0),
      ]);
      const totalWaiting = feedWaiting + paymentWaiting + campaignsWaiting;
      if (totalWaiting > 500) {
        console.warn(
          `🚨 HIGH QUEUE DEPTH ALERT: ${totalWaiting} jobs pending (Feed: ${feedWaiting}, Payment: ${paymentWaiting}, Campaigns: ${campaignsWaiting}). ` +
          `Queue backpressure detected! Ensure Render worker is autoscaling to 2–4 instances (Active user threshold > 20,000 users).`
        );
      }
    } catch {}
  }, 30000);
}

startWorker();

// Bind to port to satisfy Render's Web/Worker Service health checks
const PORT = process.env.PORT || 10000;
const server = http.createServer(async (req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Paayh queue worker is active and listening.\n");
}).listen(PORT, () => {
  console.log(`📡 Render Health Check server listening on port ${PORT}`);
});

// Graceful shutdown handling for Render deployments and container autoscaling
const handleGracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);
  
  // Close HTTP server
  server.close(() => {
    console.log("📡 Render HTTP health check server stopped.");
  });

  // Clear queue depth interval
  if (queueDepthInterval) {
    clearInterval(queueDepthInterval);
    queueDepthInterval = null;
  }

  // Drain and shut down BullMQ workers
  if (shutdownFn) {
    await shutdownFn();
  }

  console.log("👋 Worker process exited cleanly.");
  process.exit(0);
};

process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));


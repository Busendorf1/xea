import http from "http";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

console.log("🚀 Starting Standalone BullMQ Worker Process...");
console.log(`📡 Redis Host: ${process.env.REDIS_HOST || "Not configured"}`);

// Import the worker file dynamically to avoid ES6 hoisting issue
async function startWorker() {
  await import("../lib/worker");
  console.log("⚡ Queue workers successfully booted. Listening to Upstash Redis...");
}

startWorker();

// Bind to port to satisfy Render's Free Web Service requirements
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Paayh queue worker is active and listening.\n");
}).listen(PORT, () => {
  console.log(`📡 Render Health Check server listening on port ${PORT}`);
});

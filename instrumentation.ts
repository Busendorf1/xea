export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/worker");
    console.log("⚡ Next.js Server: Background BullMQ Queue Worker initialized successfully.");
  }
}

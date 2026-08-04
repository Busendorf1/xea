import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import redisConnection from "@/lib/redis";
import { feedQueue } from "@/lib/queue";
import { z } from "zod";

export const dynamic = "force-dynamic";

const getAdminEmails = (): string[] => {
  return process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
};

async function verifyAdmin() {
  const session = await auth0.getSession();
  if (!session || !session.user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), email: null };
  }

  const email = session.user.email?.toLowerCase();
  if (!email) {
    return { errorResponse: NextResponse.json({ error: "No email associated with session" }, { status: 400 }), email: null };
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(email)) {
    return { errorResponse: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }), email };
  }

  return { errorResponse: null, email };
}

const dlqActionSchema = z.object({
  action: z.enum(["retry_all", "clear_all", "retry_job"]),
  jobId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { errorResponse } = await verifyAdmin();
  if (errorResponse) return errorResponse;

  try {
    const dlqKey = "queue:dlq:dead_letter_events";
    const rawDlqJobs = await redisConnection.hgetall(dlqKey);

    const jobs = Object.entries(rawDlqJobs || {}).map(([id, payloadStr]) => {
      try {
        return { id, ...JSON.parse(payloadStr) };
      } catch {
        return { id, rawPayload: payloadStr };
      }
    });

    return NextResponse.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (err: any) {
    console.error("❌ Error fetching DLQ jobs:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch DLQ status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await verifyAdmin();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parseResult = dlqActionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid payload", details: parseResult.error.format() }, { status: 400 });
    }

    const { action, jobId } = parseResult.data;
    const dlqKey = "queue:dlq:dead_letter_events";

    if (action === "retry_all") {
      const rawDlqJobs = await redisConnection.hgetall(dlqKey);
      let retriedCount = 0;

      for (const [id, payloadStr] of Object.entries(rawDlqJobs || {})) {
        try {
          const parsed = JSON.parse(payloadStr);
          await feedQueue.add(parsed.name || "retried-dlq-job", parsed.data || parsed);
          await redisConnection.hdel(dlqKey, id);
          retriedCount++;
        } catch (err) {
          console.error(`❌ Failed to re-queue DLQ job [${id}]:`, err);
        }
      }

      return NextResponse.json({ success: true, retriedCount });
    } else if (action === "clear_all") {
      await redisConnection.del(dlqKey);
      return NextResponse.json({ success: true, message: "DLQ cleared successfully" });
    } else if (action === "retry_job" && jobId) {
      const rawJobStr = await redisConnection.hget(dlqKey, jobId);
      if (!rawJobStr) {
        return NextResponse.json({ error: "Job not found in DLQ" }, { status: 404 });
      }

      const parsed = JSON.parse(rawJobStr);
      await feedQueue.add(parsed.name || "retried-dlq-job", parsed.data || parsed);
      await redisConnection.hdel(dlqKey, jobId);

      return NextResponse.json({ success: true, jobId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error performing DLQ action:", err);
    return NextResponse.json({ error: err.message || "DLQ action failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

const recalibrateSchema = z.object({
  country: z.string().trim().min(2).max(100),
  state: z.string().trim().max(100).default(""),
  location: z.string().trim().max(100).default(""),
  source: z.enum(["gps", "ip"]).optional().default("gps"),
  proofOfLocationAgreed: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const parseResult = recalibrateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid location parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { country, state, location, source, proofOfLocationAgreed } = parseResult.data;

    // 1. Rate-limiting guard: strictly enforce once-a-day recalibration (24 hours = 86400 seconds)
    // unless explicit Proof of Location GPS authentication is being enforced.
    if (isRedisReady() && !proofOfLocationAgreed) {
      try {
        const rateLimitKey = `ratelimit:recalibrate:${emailLower}`;
        const alreadyChecked = await redisConnection.get(rateLimitKey);
        if (alreadyChecked) {
          return NextResponse.json(
            { updated: false, message: "Location has already been verified today. 24-hour rate limit in effect." },
            { status: 200 }
          );
        }
      } catch (err: any) {
        console.warn("⚠️ Rate-limit check warning:", err?.message || err);
      }
    }

    // 2. Fetch current profile location from Supabase
    const { data: userProfile, error: fetchErr } = await supabaseAdmin
      .from("users")
      .select("email, country, state, location")
      .ilike("email", emailLower)
      .maybeSingle();

    if (fetchErr) {
      console.error("❌ Failed to query user location for recalibration:", fetchErr);
      return NextResponse.json({ error: "Failed to verify current profile" }, { status: 500 });
    }

    if (!userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const currentCountry = (userProfile.country || "").trim().toLowerCase();
    const currentState = (userProfile.state || "").trim().toLowerCase();
    const currentLocation = (userProfile.location || "").trim().toLowerCase();

    const newCountry = country.trim().toLowerCase();
    const newState = state.trim().toLowerCase();
    const newLocation = location.trim().toLowerCase();

    // 3. Compare location - if identical, fast return (zero database writes)
    const isUnchanged =
      currentCountry === newCountry &&
      currentState === newState &&
      currentLocation === newLocation;

    if (isUnchanged) {
      // Set 24-hour cooldown
      if (isRedisReady()) {
        try {
          await redisConnection.set(`ratelimit:recalibrate:${emailLower}`, "1", "EX", 86400);
        } catch {}
      }
      return NextResponse.json({
        updated: false,
        message: "Location is already calibrated to current position.",
        current: { country: userProfile.country, state: userProfile.state, location: userProfile.location },
      });
    }

    // 4. Location has changed (e.g. user traveled, relocated, or had PLACEHOLDER)! Update database record
    const updatePayload = {
      country,
      state,
      location,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .ilike("email", emailLower);

    if (updateErr) {
      console.error("❌ Failed to update recalibrated location:", updateErr);
      return NextResponse.json({ error: "Failed to persist updated location" }, { status: 500 });
    }

    // 5. Invalidate profile and feed caches in Redis so feed is immediately recalibrated
    if (isRedisReady()) {
      try {
        await Promise.all([
          invalidateCachedProfile(emailLower),
          redisConnection.del(`profile:${emailLower}`),
          redisConnection.del(`feed:ad_ids:${emailLower}`),
          redisConnection.del(`feed:profiles:${emailLower}`),
          redisConnection.set(`ratelimit:recalibrate:${emailLower}`, "1", "EX", 86400),
        ]);
      } catch (err: any) {
        console.warn("⚠️ Redis cache invalidation warning on recalibrate:", err?.message || err);
      }
    }

    console.log(
      `📍 User location recalibrated for ${emailLower} via ${source}: [${userProfile.location || ""}, ${userProfile.state}, ${userProfile.country}] -> [${location}, ${state}, ${country}]`
    );

    return NextResponse.json({
      updated: true,
      source,
      previous: {
        country: userProfile.country,
        state: userProfile.state,
        location: userProfile.location,
      },
      current: {
        country,
        state,
        location,
      },
    });
  } catch (err: any) {
    console.error("❌ Recalibrate location uncaught exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

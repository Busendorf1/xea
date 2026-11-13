import { NextRequest } from "next/server";
import { GET as checkUsernameHandler } from "@/app/api/profile/check-username/route";

// Re-export GET handler to support /api/username/check calls from mobile and external clients
export async function GET(req: NextRequest) {
  return checkUsernameHandler(req);
}

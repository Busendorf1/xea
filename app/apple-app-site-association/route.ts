import { GET as wellKnownGet } from "../.well-known/apple-app-site-association/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return wellKnownGet();
}

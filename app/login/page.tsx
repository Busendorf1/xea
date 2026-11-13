import { redirect } from "next/navigation";
import { extractSharedAdIdFromSearchParams } from "@/lib/utils/adShare";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === "string") urlParams.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") urlParams.set(k, v[0]);
  }

  const sharedAdId = extractSharedAdIdFromSearchParams(urlParams);
  if (sharedAdId) {
    redirect(`/ad/${encodeURIComponent(sharedAdId)}`);
  }

  if (urlParams.get("adStatus") === "unavailable") {
    redirect("/?adStatus=unavailable");
  }

  redirect("/");
}

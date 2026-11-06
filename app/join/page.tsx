"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function JoinRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref) {
      try {
        localStorage.setItem("paayh_ref_code", ref);
        document.cookie = `paayh_ref_code=${encodeURIComponent(ref)}; path=/; max-age=2592000; SameSite=Lax`;
      } catch {}
      router.replace(`/?ref=${encodeURIComponent(ref)}`);
    } else {
      router.replace("/");
    }
  }, [router, searchParams]);

  return null;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinRedirectInner />
    </Suspense>
  );
}

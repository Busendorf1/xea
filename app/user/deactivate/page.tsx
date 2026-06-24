

import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import DeactivateAccount from '@/components/Deactivate/page';

export default async function AdPage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return (
    <div>
      <DeactivateAccount session={session} />
    </div>
  );
}


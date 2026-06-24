

import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import News from '@/components/News/page';
import Footer from '@/components/Footer/page';

export default async function AdPage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return (
    <div>
      <News session={session} />
      <Footer />
    </div>
  );
}


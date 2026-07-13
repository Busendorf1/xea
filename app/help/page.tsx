import { auth0 } from "@/lib/auth0";
import HelpCenter from "@/components/HelpCenter/page";
import Header from "@/components/Header/page";
import Footer from "@/components/Footer/page";

export const metadata = {
  title: "Help Center | Paayh",
  description: "Submit a complaint, report an issue, or request information. Our team will respond as soon as possible.",
};

export default async function HelpCenterPage() {
  const session = await auth0.getSession();

  return (
    <>
      <Header />
      <HelpCenter session={session ?? null} />
      <Footer />
    </>
  );
}

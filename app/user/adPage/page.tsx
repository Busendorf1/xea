
// import styles from "../adPage/page.module.css";
// import AdForm from "../component/Ad/page";
// // import FrontTextAds from "../component/FrontTextAds/page";

// export default function Home() {
//   return (
//     <div className={styles.page}>
//         <AdForm />
//     </div>
//   );
// }


import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import MultiStepAdForm from '@/components/Ad/page';
import Footer from '@/components/Footer/page';

export default async function AdPage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return (
    <div>
      <MultiStepAdForm session={session} />
      <Footer />
    </div>
  );
}


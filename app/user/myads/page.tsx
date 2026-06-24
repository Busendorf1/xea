// import MyNews from "@/app/component/MyNews/page";
// import MyAds from "../../component/MyAds/page";
// import { getAuthSession } from "@/lib/auth";

// export default async function MyAdsPage() {
//   const session = await getAuthSession();

//   if (!session) {
//     return (
//       <div >
//         <h2>You must be logged in to view your ads.</h2>
//       </div>
//     );
//   }

//   return (
//     <div >
//       <h1>Your Ads</h1>
//       <MyNews session={session} />
//       <MyAds session={session} />
//     </div>
//   );
// }


import MyNews from "@/components/MyNews/page";
import MyAds from "@/components/MyAds/page";
import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import styles from "../../user/myads/page.module.css";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";

export default async function MyAdsPage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return (
    <>
      <HeaderJoin />
      <div className={styles.pageContainer}>
        <h1 className={styles.pageTitle}>Publications</h1>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Highlights</h2>
          <MyNews session={session} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Adverts</h2>
          <MyAds session={session} />
        </section>
      </div>
      <Footer /> 
    </>
  );
}



import styles from "../advert/page.module.css";
import Footer from "@/components/Footer/page";
import FrontTextAds from "@/components/FrontTextAds/page";

export default function Home() {
  return (
    <div className={styles.page}>
        <FrontTextAds />
        <Footer />
    </div>
  );
}

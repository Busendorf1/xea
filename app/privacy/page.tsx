// import Image from "next/image";
import Footer from "@/components/Footer/page";
import PolicyPage from "@/components/Policy/page";
import styles from "../join/page.module.css";
import Header from "@/components/Headerhome/page";

export default function Home() {
  return (
    <div className={styles.page}>
        <Header />
        <PolicyPage />
        <Footer />
    </div>
  );
}

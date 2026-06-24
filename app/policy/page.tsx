// import Image from "next/image";
import Footer from "@/components/Footer/page";
import HeaderJoin from "@/components/HeaderJoin/page";
import PolicyPage from "@/components/Policy/page";
import styles from "../join/page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
        <HeaderJoin />
        <PolicyPage />
        <Footer />
    </div>
  );
}

import FrontText from "@/components/FrontText/page";
import Header from "@/components/Headerhome/page";
import styles from "@/app/page.module.css";

export default function ModalPage() {
  return (
    <div className={styles.page}>
      <Header />
      <FrontText />
    </div>
  );
}

import Footer from "@/components/Footer/page";
import HeaderJoin from "@/components/HeaderJoin/page";
import Careers from "@/components/Careers/page";
import styles from "../join/page.module.css";

export const metadata = {
  title: "Careers | Paayh",
  description: "Join the Paayh team. We are building the future of the attention economy.",
};

export default function CareersPage() {
  return (
    <div className={styles.page}>
      <HeaderJoin />
      <Careers />
      <Footer />
    </div>
  );
}

import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";
import BusinessSubscribeComponent from "@/components/BusinessSubscribe/page";
import styles from "../../join/page.module.css";

export const metadata = {
  title: "Business Premium Subscriber | Paayh",
  description: "Register your business domain as a Paayh Premium Subscriber and unlock 30% ad cost subsidies for sellers on your platform.",
};

export default function BusinessSubscribePage() {
  return (
    <div className={styles.page}>
      <HeaderJoin />
      <BusinessSubscribeComponent />
      <Footer />
    </div>
  );
}

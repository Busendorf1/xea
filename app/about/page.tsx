import Link from 'next/link';
import styles from '../about/page.module.css';
import HeaderJoin from '@/components/HeaderJoin/page';
import Footer from '@/components/Footer/page';

export default function AboutPage() {
  return (
    <> 
        <HeaderJoin />
    <div className={styles.container}>
      <h1 className={styles.title}>About Paayh</h1>

      <section className={styles.section}>
        <p className={styles.sectionText}>
          <strong>Paayh</strong> is pioneering an equitable attention and content discovery ecosystem. Viewing content is voluntary, for fun, entertainment, and the discovery of exciting products, services, and local community offers, with members receiving decent rewards for verified human focus. Posting promotional content is voluntary, requiring service fees for queue placement and delivery.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Our Mission</h2>
        <p className={styles.sectionText}>
          We aim to build a transparent digital ecosystem where advertisers achieve <strong>high target deliverability</strong> to verified active members, knowing their audience voluntarily receives a transparent reward for their focused attention from their promotional budget. Members voluntarily explore offers without any forced patronage, creating a genuine win-win relationship.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <p className={styles.sectionText}>
          When you voluntarily view content tailored to your preferences, you receive a dynamic share of <strong>up to 50%</strong> of net advertising revenue in the form of attention rewards. Advertisers know their campaign spend directly rewards real human focus. We enforce strict anti-bot kinematics, pre-publication content reviews, and built-in reporting tools to ensure quality and safety. No subscriptions. No tricks. Just fair value for your time.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Why Paayh Matters</h2>
        <p className={styles.sectionText}>
          AI is transforming industries and replacing traditional jobs. At Paayh, we believe there is still one thing AI cannot do: pay attention like a human. We built Paayh so that your presence, your preferences, and your choices become sources of income, not just data for someone else to monetise.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Why It Matters to Advertisers</h2>
        <p className={styles.sectionText}>
          On Paayh, ads are not background noise, they are the main event. Users come here to engage with ads that match their interests. No hidden placements, no bots, no skipped impressions. Just genuine attention from real people.
        </p>
        <p className={styles.sectionText}>
          That means higher conversions, more impact, and nearly zero waste. Whether you are selling a product, hiring talent, promoting a course, or launching a webinar, your audience is already eager to listen. Just make your creative count.
        </p>
        <p className={styles.sectionText}>
          Compared to platforms that hide ads inside content or force them on uninterested users, Paayh offers clarity and trust, and that trust is where real results begin.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Looking Ahead</h2>
        <p className={styles.sectionText}>
          As the platform grows, so does your earning power. Paayh is more than a product, it is a movement toward equitable, accessible income. We hope to inspire a new generation of platforms to follow suit.
        </p>
        <p className={styles.sectionText}>
          <strong>Your data and privacy are safe with us.</strong> We never sell your information, and all data is handled with care. Review our{' '}
          <Link href="/terms" className={styles.link}>Terms of Service</Link> and{' '}
          <Link href="/privacy" className={styles.link}>Privacy Policy</Link>.
        </p>
      </section>
    </div>
    <Footer />
    </>
  );
}

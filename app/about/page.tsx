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
          <strong>Paayh</strong> is pioneering a new economic model, one where attention is currency and Universal Basic Income is not just a concept, but a reality.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Our Mission</h2>
        <p className={styles.sectionText}>
          We aim to build a fair ecosystem where advertisers get <strong>99.99% ad deliverability</strong> and users are rewarded for giving <strong>genuine human attention</strong>. This is not just about ads, it is an income stream rooted in participation, not exploitation.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <p className={styles.sectionText}>
          When you view ads tailored to your interests, you earn a <strong>60% share</strong> of the ad revenue. The remaining 40% supports platform growth, operations, and ongoing innovation. No subscriptions. No tricks. Just fair value for your time.
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
          <strong>Your data and privacy are safe with us.</strong> We never sell your information, and all data is handled with care. Learn more in our{' '}
          <Link href="/privacy" className={styles.link}>Privacy Policy</Link>.
        </p>
      </section>
    </div>
    <Footer />
    </>
  );
}

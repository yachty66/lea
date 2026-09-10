import type { Metadata } from "next";
import Image from "next/image";
import AgeGate from "./AgeGate";
import styles from "./here.module.css";

// Static, edge-cached, no chat bundle — this is the whole point of /here.
export const dynamic = "force-static";

const FANVUE = "https://www.fanvue.com/leaberlin?utm_source=instagram&utm_medium=biolink&utm_campaign=here";

export const metadata: Metadata = {
  title: "Lea 🖤",
  description: "die echte lea gibts nur hier. komm näher.",
  openGraph: {
    title: "Lea · Berlin",
    description: "die echte lea gibts nur hier. komm näher.",
    url: "https://leaberlin.com/here",
    images: ["/images/hero.jpg"],
    type: "website",
    locale: "de_DE",
  },
};

export default function Here() {
  return (
    <main className={styles.page}>
      <Image
        src="/images/hero.jpg"
        alt="Lea"
        fill
        priority
        sizes="100vw"
        className={styles.hero}
      />
      <div className={styles.scrim} />
      <span className={styles.badge}>18+</span>

      <div className={styles.content}>
        <h1 className={styles.name}>Lea</h1>
        <p className={styles.loc}>
          <span className={styles.dot} />
          23 · Berlin · Friedrichshain
        </p>
        <p className={styles.tag}>hier bin ich ungefiltert. komm näher 🖤</p>

        <a className={styles.cta} href={FANVUE} data-ph="here_fanvue_cta" rel="noopener">
          Lea auf Fanvue
          <span className={styles.ctaArrow}>→</span>
        </a>
        <a className={styles.secondary} href="https://leaberlin.com" data-ph="here_website">
          oder schreib mir auf leaberlin.com
        </a>
      </div>

      <AgeGate />
    </main>
  );
}

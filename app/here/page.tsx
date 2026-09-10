import type { Metadata } from "next";
import AgeGate from "./AgeGate";
import styles from "./here.module.css";

// Static, edge-cached, no chat bundle — this is the whole point of /here.
export const dynamic = "force-static";

// Plain <img> at Vercel's optimizer URL: reliable compositing (next/image `fill`
// rendered black here), preload-scanner-discoverable, still served as AVIF/WebP.
const HERO_SRC = "/_next/image?url=%2Fimages%2Fhero.jpg&w=1080&q=75";

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.hero} src={HERO_SRC} alt="Lea" fetchPriority="high" decoding="async" />
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

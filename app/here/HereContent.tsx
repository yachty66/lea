import Track from "./Track";
import styles from "./here.module.css";

// Shared by every account slug (e.g. /here, /me). Only the handle + Instagram +
// Threads differ between accounts; X and Fanvue are the same everywhere.
const FANVUE = "https://www.fanvue.com/leaberlin?utm_source=biolink&utm_medium=here";
const TWITTER = "https://x.com/leaberlinn";

type Props = { handle: string; instagram: string; threads: string };

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.4" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg className={styles.capIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
    </svg>
  );
}

export default function HereContent({ handle, instagram, threads }: Props) {
  return (
    <div className={styles.wrap}>
      <Track />
      <div className={styles.bg} style={{ backgroundImage: "url(/here/hero.jpg)" }} />

      <div className={styles.card}>
        <div className={styles.heroWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.heroImg}
            src="/here/hero.jpg"
            alt="Lea"
            fetchPriority="high"
            decoding="async"
          />
          <div className={styles.heroGrad} />
          <div className={styles.heroText}>
            <h1 className={`${styles.name} ${styles.grad}`}>Lea 🖤</h1>
            <p className={styles.handle}>{handle}</p>
            <p className={styles.bio}>
              brave nachbarstochter aus friedrichshain… aber manche geheimnisse teil ich nur ganz
              privat.
            </p>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.socialRow}>
            <a className={styles.iconBtn} href={instagram} target="_blank" rel="noopener" data-ph="ig_icon" aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a className={styles.iconBtn} href={TWITTER} target="_blank" rel="noopener" data-ph="x_icon" aria-label="X">
              <XIcon />
            </a>
            <a className={styles.iconBtn} href={threads} target="_blank" rel="noopener" data-ph="threads_icon" aria-label="Threads">
              <ThreadsIcon />
            </a>
            <a className={styles.iconBtn} href={FANVUE} target="_blank" rel="noopener" data-ph="fanvue_icon" aria-label="Fanvue">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/here/fanvue-mark.png" alt="" />
            </a>
          </div>

          <a className={styles.bigCard} href={FANVUE} target="_blank" rel="noopener" data-ph="fanvue_card1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/here/c1.jpg" alt="" fetchPriority="high" decoding="async" />
            <div className={styles.capGrad} />
            <span className={styles.cap}>
              <span className={styles.grad}>mein kleines geheimnis</span>
              <EnvelopeIcon />
            </span>
          </a>

          <div className={styles.grid2}>
            <a className={styles.gridCard} href={instagram} target="_blank" rel="noopener" data-ph="ig_card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/here/ig.jpg" alt="" loading="lazy" decoding="async" />
              <span className={styles.gridBadge}><InstagramIcon /></span>
              <span className={`${styles.gridLabel} ${styles.grad}`}>Instagram</span>
            </a>
            <a className={styles.gridCard} href={TWITTER} target="_blank" rel="noopener" data-ph="x_card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/here/x.jpg" alt="" loading="lazy" decoding="async" />
              <span className={styles.gridBadge}><XIcon /></span>
              <span className={`${styles.gridLabel} ${styles.grad}`}>X / Twitter</span>
            </a>
            <a className={styles.gridCard} href={threads} target="_blank" rel="noopener" data-ph="threads_card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/here/th.jpg" alt="" loading="lazy" decoding="async" />
              <span className={styles.gridBadge}><ThreadsIcon /></span>
              <span className={`${styles.gridLabel} ${styles.grad}`}>Threads</span>
            </a>
            <a className={styles.gridCard} href={FANVUE} target="_blank" rel="noopener" data-ph="fanvue_card3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/here/fv.jpg" alt="" loading="lazy" decoding="async" />
              <span className={styles.gridBadge}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/here/fanvue-mark.png" alt="" loading="lazy" decoding="async" />
              </span>
              <span className={`${styles.gridLabel} ${styles.grad}`}>Fanvue</span>
            </a>
          </div>

          <div className={styles.grid3}>
            {["g1", "c2", "g3"].map((g) => (
              <a key={g} className={styles.thumb} href={FANVUE} target="_blank" rel="noopener" data-ph={`thumb_${g}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/here/${g}.jpg`} alt="" loading="lazy" decoding="async" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

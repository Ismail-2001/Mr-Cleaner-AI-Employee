import styles from './Hero.module.css';

export default function Hero() {
    return (
        <section className={styles.hero}>
            <div className={`${styles.content} animate-fade-in`}>
                <div className={styles.badge}>Texas' #1 Luxury Detailers</div>
                <h1 className={styles.title}>
                    Your Car Deserves <br />
                    <span className={styles.highlight}>Elite Treatment</span>
                </h1>
                <p className={styles.description}>
                    Book your premium mobile detail in 60 seconds. Our AI Maya handles everything 24/7. We come to you.
                </p>
                <div className={styles.actions}>
                    <button className={styles.primaryBtn} onClick={() => window.scrollTo({ top: document.getElementById('services').offsetTop, behavior: 'smooth' })}>
                        View Services
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}>
                        Start Booking
                    </button>
                </div>
            </div>
            <div className={styles.overlay}></div>
        </section>
    );
}

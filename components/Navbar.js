import styles from './Navbar.module.css';

export default function Navbar() {
    return (
        <nav className={styles.nav}>
            <div className="container">
                <div className={styles.wrapper}>
                    <div className={styles.logo}>
                        <span className={styles.mc}>MC</span>
                        <span className={styles.text}>Mr. Cleaner</span>
                    </div>
                    <div className={styles.links}>
                        <a href="#services">Services</a>
                        <a href="#experience">AI Vision</a>
                        <button className={styles.cta} onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}>
                            Book Now
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}

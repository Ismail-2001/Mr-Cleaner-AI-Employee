import styles from './VisionShowcase.module.css';
import { Camera, Zap, ShieldCheck, Sparkles } from 'lucide-react';

export default function VisionShowcase() {
    return (
        <section className={styles.section}>
            <div className="container">
                <div className={styles.grid}>
                    <div className={styles.content}>
                        <div className={styles.badge}>Next-Gen Intelligence</div>
                        <h2 className={styles.title}>Visual Intelligence <br />for Elite Maintenance</h2>
                        <p className={styles.description}>
                            Your vehicle deserves more than a standard checklist. Our **Maya AI Vision**
                            engine analyzes your car's specific paint condition and interior surfaces
                            from your photos—providing a customized restoration blueprint in seconds.
                        </p>

                        <div className={styles.featureList}>
                            <div className={styles.featureRow}>
                                <div className={styles.iconBox}><Camera size={20} /></div>
                                <div>
                                    <h4>Instant Photo Analysis</h4>
                                    <p>Identifies make, model, and body type automatically.</p>
                                </div>
                            </div>
                            <div className={styles.featureRow}>
                                <div className={styles.iconBox}><Zap size={20} /></div>
                                <div>
                                    <h4>Surface Diagnostics</h4>
                                    <p>Detects oxidation, scratches, and contaminants via AI.</p>
                                </div>
                            </div>
                            <div className={styles.featureRow}>
                                <div className={styles.iconBox}><ShieldCheck size={20} /></div>
                                <div>
                                    <h4>Dynamic Quote Locking</h4>
                                    <p>Get an exact estimate based on actual vehicle size.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.visualContainer}>
                        <div className={styles.glassFrame}>
                            <div className={styles.aiOverlay}>
                                <div className={styles.scanLine}></div>
                                <div className={styles.point1}><span>Oxidation Detected</span></div>
                                <div className={styles.point2}><span>2024 Model Sync</span></div>
                                <div className={styles.point3}><span>Elite Package Recommended</span></div>
                            </div>
                            {/* In a real app, this would be a high-end image of a car being scanned */}
                            <div className={styles.mockImg}></div>
                        </div>
                        <div className={styles.glowEffect}></div>
                    </div>
                </div>
            </div>
        </section>
    );
}

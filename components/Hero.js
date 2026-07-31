'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import MagneticButton from './MagneticButton';
import FloatingParticles from './FloatingParticles';
import styles from './Hero.module.css';
import { ArrowRight } from 'lucide-react';

const wordReveal = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.3,
        },
    },
};

const wordChild = {
    hidden: { opacity: 0, y: 40, filter: 'blur(8px)' },
    visible: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
};

const badgeReveal = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 },
    },
};

const descReveal = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.8 },
    },
};

const actionsReveal = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 1.0 },
    },
};

const trustReveal = {
    hidden: { opacity: 0, y: 40 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1.2 },
    },
};

const defaultLine1 = ['Your', 'Car', 'Deserves'];
const defaultLine2 = ['Elite', 'Treatment'];

export default function Hero({ config }) {
    const line1Words = config?.line1 || defaultLine1;
    const line2Words = config?.line2 || defaultLine2;
    const badge = config?.badge || "Texas' #1 Luxury Detailers";
    const description = config?.description || 'Book your premium mobile detail in 60 seconds. Our AI Maya handles everything 24/7. We come to you.';
    const heroRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ['start start', 'end start'],
    });

    const orb1Y = useTransform(scrollYProgress, [0, 1], [0, -150]);
    const orb2Y = useTransform(scrollYProgress, [0, 1], [0, -100]);
    const orb1Scale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);
    const orb2Scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);

    return (
        <section ref={heroRef} className={styles.hero}>
            <div className={styles.grainOverlay}></div>
            <div className={styles.meshGradient}></div>
            <FloatingParticles />
            <motion.div className={styles.glowOrb1} style={{ y: orb1Y, scale: orb1Scale }}></motion.div>
            <motion.div className={styles.glowOrb2} style={{ y: orb2Y, scale: orb2Scale }}></motion.div>

            <motion.div
                className={styles.content}
                initial="hidden"
                animate="visible"
            >
                <motion.div className={styles.badge} variants={badgeReveal}>
                    <span className={styles.badgeDot}></span>
                    {badge}
                </motion.div>

                <h1 className={styles.title}>
                    <motion.span
                        className={styles.line}
                        variants={wordReveal}
                        initial="hidden"
                        animate="visible"
                    >
                        {line1Words.map((word, i) => (
                            <motion.span key={i} className={styles.word} variants={wordChild}>
                                {word}
                            </motion.span>
                        ))}
                    </motion.span>
                    <br />
                    <motion.span
                        className={`${styles.line} ${styles.line2}`}
                        variants={wordReveal}
                        initial="hidden"
                        animate="visible"
                    >
                        {line2Words.map((word, i) => (
                            <motion.span
                                key={i}
                                className={`${styles.word} ${styles.highlight}`}
                                variants={wordChild}
                            >
                                {word}
                            </motion.span>
                        ))}
                    </motion.span>
                </h1>

                <motion.p className={styles.description} variants={descReveal} initial="hidden" animate="visible">
                    {description}
                </motion.p>

                <motion.div className={styles.actions} variants={actionsReveal} initial="hidden" animate="visible">
                    <MagneticButton
                        className={styles.primaryBtn}
                        onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                    >
                        Start Booking
                        <ArrowRight size={18} />
                    </MagneticButton>
                    <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                            const el = document.getElementById('services');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                    >
                        View Services
                    </button>
                </motion.div>

                <motion.div className={styles.trustBar} variants={trustReveal} initial="hidden" animate="visible">
                    <div className={styles.trustItem}>
                        <span className={styles.trustNumber}>2,400+</span>
                        <span className={styles.trustLabel}>Details Completed</span>
                    </div>
                    <div className={styles.trustDivider}></div>
                    <div className={styles.trustItem}>
                        <span className={styles.trustNumber}>4.9</span>
                        <span className={styles.trustLabel}>Google Rating</span>
                    </div>
                    <div className={styles.trustDivider}></div>
                    <div className={styles.trustItem}>
                        <span className={styles.trustNumber}>24/7</span>
                        <span className={styles.trustLabel}>AI Concierge</span>
                    </div>
                </motion.div>
            </motion.div>

            <div className={styles.scrollIndicator}>
                <div className={styles.scrollLine}></div>
            </div>
        </section>
    );
}

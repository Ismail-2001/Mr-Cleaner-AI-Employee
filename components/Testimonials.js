'use client';

import { motion } from 'framer-motion';
import styles from './Testimonials.module.css';
import { Star, Quote } from 'lucide-react';

const defaultTestimonials = [
    {
        name: 'James Richardson',
        role: 'BMW M4 Owner',
        text: 'Maya understood exactly what my car needed. The ceramic coating came out flawless. Best detailing experience in Austin.',
        rating: 5,
        location: 'Austin, TX'
    },
    {
        name: 'Sarah Chen',
        role: 'Tesla Model S Owner',
        text: 'Booked through the AI at 2 AM, had my appointment confirmed in minutes. The attention to detail was extraordinary.',
        rating: 5,
        location: 'Dallas, TX'
    },
    {
        name: 'Michael Torres',
        role: 'Porsche Cayenne Owner',
        text: 'They transformed my SUV from neglected to showroom condition. The paint correction alone was worth every penny.',
        rating: 5,
        location: 'Houston, TX'
    }
];

const headerReveal = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
};

const containerReveal = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
};

const cardReveal = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
    },
};

export default function Testimonials({ config }) {
    const testimonials = config || defaultTestimonials;
    return (
        <section className={styles.section}>
            <div className="container">
                <motion.div
                    className={styles.header}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    variants={headerReveal}
                >
                    <span className={styles.badge}>Client Stories</span>
                    <h2 className={styles.title}>Trusted by Texas&apos; Finest</h2>
                    <p className={styles.subtitle}>
                        Hear from vehicle owners who trust us with their most prized possessions.
                    </p>
                </motion.div>

                <motion.div
                    className={styles.grid}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    variants={containerReveal}
                >
                    {testimonials.map((t, i) => (
                        <motion.div key={i} className={styles.card} variants={cardReveal}>
                            <div className={styles.quoteIcon}>
                                <Quote size={24} />
                            </div>
                            <div className={styles.stars}>
                                {[...Array(t.rating)].map((_, j) => (
                                    <Star key={j} size={16} fill="var(--gold)" color="var(--gold)" />
                                ))}
                            </div>
                            <p className={styles.text}>&ldquo;{t.text}&rdquo;</p>
                            <div className={styles.author}>
                                <div className={styles.avatar}>{t.name.charAt(0)}</div>
                                <div>
                                    <div className={styles.name}>{t.name}</div>
                                    <div className={styles.role}>{t.role} &middot; {t.location}</div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

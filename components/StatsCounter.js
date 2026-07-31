'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from './StatsCounter.module.css';

function AnimatedNumber({ target, suffix = '', prefix = '' }) {
    const [count, setCount] = useState(0);
    const ref = useRef(null);
    const hasAnimated = useRef(false);
    const isInView = useInView(ref, { once: true, margin: '-50px' });

    useEffect(() => {
        if (isInView && !hasAnimated.current) {
            hasAnimated.current = true;
            const duration = 2000;
            const steps = 60;
            const increment = target / steps;
            let current = 0;
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    setCount(target);
                    clearInterval(timer);
                } else {
                    setCount(Math.floor(current));
                }
            }, duration / steps);
        }
    }, [isInView, target]);

    return (
        <span ref={ref} className={styles.number}>
            {prefix}{count.toLocaleString()}{suffix}
        </span>
    );
}

const defaultStats = [
    { number: 2400, suffix: '+', label: 'Details Completed', description: 'Premium vehicles serviced' },
    { number: 98, suffix: '%', label: 'Satisfaction Rate', description: 'Five-star reviews' },
    { number: 45, suffix: 'min', label: 'Average Booking', description: 'From chat to confirmed' },
    { number: 3, suffix: 'x', label: 'Revenue Growth', description: 'Since AI integration' },
];

const containerReveal = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
};

const cardReveal = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
};

export default function StatsCounter({ config }) {
    const stats = config || defaultStats;
    return (
        <section className={styles.section}>
            <div className="container">
                <motion.div
                    className={styles.grid}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-50px' }}
                    variants={containerReveal}
                >
                    {stats.map((stat, i) => (
                        <motion.div key={i} className={styles.card} variants={cardReveal}>
                            <AnimatedNumber target={stat.number} suffix={stat.suffix} />
                            <div className={styles.label}>{stat.label}</div>
                            <div className={styles.description}>{stat.description}</div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

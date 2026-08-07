'use client';

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import styles from './BeforeAfterSlider.module.css';

export default function BeforeAfterSlider({ beforeSrc, afterSrc, beforeAlt = 'Before', afterAlt = 'After' }) {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef(null);

    const handleMove = useCallback((clientX) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPosition(percentage);
    }, []);

    const handleMouseDown = useCallback(() => {
        setIsDragging(true);
    }, []);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        handleMove(e.clientX);
    }, [isDragging, handleMove]);

    const handleTouchMove = useCallback((e) => {
        handleMove(e.touches[0].clientX);
    }, [handleMove]);

    return (
        <motion.div
            ref={containerRef}
            className={styles.container}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className={styles.imageContainer}>
                <Image
                    src={afterSrc}
                    alt={afterAlt}
                    fill
                    sizes="(max-width: 800px) 100vw, 800px"
                    className={styles.image}
                    draggable={false}
                />
                <div
                    className={styles.beforeContainer}
                    style={{ width: `${sliderPosition}%` }}
                >
                    <Image
                        src={beforeSrc}
                        alt={beforeAlt}
                        fill
                        sizes="(max-width: 800px) 100vw, 800px"
                        className={styles.image}
                        draggable={false}
                    />
                </div>
                <div
                    className={styles.slider}
                    style={{ left: `${sliderPosition}%` }}
                    onMouseDown={handleMouseDown}
                    onTouchMove={handleTouchMove}
                    onTouchStart={handleMouseDown}
                    onTouchEnd={handleMouseUp}
                >
                    <div className={styles.sliderLine} />
                    <div className={styles.sliderHandle}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 4L4 8L8 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 4L20 8L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>
                <div className={styles.labelBefore}>Before</div>
                <div className={styles.labelAfter}>After</div>
            </div>
        </motion.div>
    );
}

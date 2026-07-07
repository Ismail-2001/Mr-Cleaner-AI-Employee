'use client';

import styles from './ChatButton.module.css';
import { MessageSquare } from 'lucide-react';

export default function ChatButton() {
    const handleClick = () => {
        window.dispatchEvent(new CustomEvent('open-chat'));
    };

    return (
        <button className={styles.button} onClick={handleClick} aria-label="Open Maya Assistant">
            <MessageSquare size={28} />
            <span className={styles.tooltip}>Book Now</span>
        </button>
    );
}

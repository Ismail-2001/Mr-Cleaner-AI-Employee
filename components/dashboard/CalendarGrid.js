'use client';
import { useState, useEffect } from 'react';
import styles from './CalendarGrid.module.css';

export default function CalendarGrid() {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchSlots = async (date) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/bookings?date=${date}`);
            if (!response.ok) {
                setSlots([]);
                return;
            }
            const data = await response.json();
            // Use real availability from the API, or empty array if none
            setSlots(data.availability || []);
        } catch {
            setSlots([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlots(selectedDate);
    }, [selectedDate]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3>Live Availability</h3>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={styles.dateInput}
                    min={new Date().toISOString().split('T')[0]}
                />
            </div>

            <div className={styles.grid}>
                {loading ? (
                    <div className={styles.loader}>Checking Calendar...</div>
                ) : slots.length === 0 ? (
                    <div className={styles.empty}>
                        No availability data for this date. Connect your Google Calendar for real-time slots.
                    </div>
                ) : (
                    slots.map((slot, index) => (
                        <div
                            key={index}
                            className={`${styles.slot} ${styles[slot.status]}`}
                        >
                            <span className={styles.time}>{slot.time}</span>
                            <span className={styles.statusLabel}>
                                {slot.status === 'busy' ? 'Booked' : 'Available'}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <p className={styles.note}>
                * Slots are synced in real-time with your Google Calendar.
            </p>
        </div>
    );
}

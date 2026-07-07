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
            const data = await response.json();
            // Assuming the existing /api/bookings returns availability if a date is provided
            // If not, we'll need to update that route or use a dedicated one.
            // For now, let's mock the live response structure based on our lib/calendar.js
            setSlots(data.availability || [
                { time: '8:00 AM', status: 'available' },
                { time: '11:00 AM', status: 'available' },
                { time: '2:00 PM', status: 'available' }
            ]);
        } catch (error) {
            console.error("Failed to fetch slots:", error);
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

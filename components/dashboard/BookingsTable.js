'use client';

import { useState, useEffect } from 'react';
import styles from './BookingsTable.module.css';
import { MoreVertical, RefreshCw } from 'lucide-react';

export default function BookingsTable({ bookings = [] }) {
    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'confirmed': return '#30D158';
            case 'pending': return '#FF9F0A';
            case 'cancelled': return '#FF453A';
            default: return '#666';
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Recent Elite Reservations</h2>
                <div className={styles.filters}>
                    <select className={styles.filterSelect}>
                        <option>All Availability</option>
                        <option>Pending Approval</option>
                        <option>Confirmed Elite</option>
                    </select>
                </div>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Service</th>
                        <th>Vehicle</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Price</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {bookings.map((booking) => (
                        <tr key={booking.id}>
                            <td>
                                <div className={styles.customerInfo}>
                                    <strong>{booking.customer_name || 'Inquiry'}</strong>
                                    <span>{booking.phone || 'No phone'}</span>
                                </div>
                            </td>
                            <td>{booking.service}</td>
                            <td><span className={styles.badge}>{booking.vehicle_type}</span></td>
                            <td>
                                <div className={styles.dateTime}>
                                    <div className={styles.date}>
                                        {booking.scheduled_at
                                            ? new Date(booking.scheduled_at).toLocaleDateString()
                                            : booking.booking_date}
                                    </div>
                                    <div className={styles.time}>
                                        {booking.scheduled_at
                                            ? new Date(booking.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : booking.booking_time}
                                    </div>
                                </div>
                            </td>

                            <td>
                                <div className={styles.statusRow}>
                                    <div
                                        className={styles.statusDot}
                                        style={{ backgroundColor: getStatusColor(booking.status) }}
                                    ></div>
                                    {booking.status}
                                </div>
                            </td>
                            <td className={styles.price}>${booking.service_price || booking.price}</td>
                            <td className={styles.actions}>
                                <button className={styles.actionBtn}><MoreVertical size={16} /></button>
                            </td>
                        </tr>
                    ))}
                    {bookings.length === 0 && (
                        <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                No bookings found. Try booking one with Maya!
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

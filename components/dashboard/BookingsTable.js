'use client';

import { useState } from 'react';
import styles from './BookingsTable.module.css';
import { RefreshCw, RotateCcw, X, AlertTriangle, CheckCircle } from 'lucide-react';

function ConfirmModal({ booking, onConfirm, onCancel, loading }) {
    if (!booking) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
        }} onClick={onCancel}>
            <div style={{
                background: '#1a1d23',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '440px',
                width: '100%',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'rgba(255,69,58,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                    }}>
                        <AlertTriangle size={24} color="#FF453A" />
                    </div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.15rem' }}>Refund This Booking?</h3>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
                        This will issue a full refund to the customer and mark the booking as refunded.
                        This action cannot be undone.
                    </p>
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '24px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Customer</span>
                        <span style={{ color: '#fff', fontSize: '0.85rem' }}>{booking.customer_name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Service</span>
                        <span style={{ color: '#fff', fontSize: '0.85rem' }}>{booking.service}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Amount</span>
                        <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: '600' }}>${booking.service_price || booking.price}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onCancel} disabled={loading} style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                    }}>
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={loading} style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: loading ? 'rgba(255,69,58,0.3)' : '#FF453A',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                    }}>
                        {loading ? <><RotateCcw size={16} className="spin" /> Processing...</> : 'Confirm Refund'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Toast({ message, type, onClose }) {
    const bgColor = type === 'success' ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)';
    const borderColor = type === 'success' ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)';
    const textColor = type === 'success' ? '#30D158' : '#FF453A';
    const Icon = type === 'success' ? CheckCircle : AlertTriangle;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#1a1d23',
            border: `1px solid ${borderColor}`,
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1001,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.3s ease',
        }}>
            <Icon size={20} color={textColor} />
            <span style={{ color: '#fff', fontSize: '0.9rem' }}>{message}</span>
            <button onClick={onClose} style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
                padding: '4px',
            }}>
                <X size={16} />
            </button>
        </div>
    );
}

export default function BookingsTable({ bookings = [] }) {
    const [filter, setFilter] = useState('all');
    const [refunding, setRefunding] = useState(null);
    const [refundLoading, setRefundLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const filteredBookings = filter === 'all'
        ? bookings
        : bookings.filter(b => b.status?.toLowerCase() === filter);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'confirmed': return '#30D158';
            case 'pending': return '#FF9F0A';
            case 'cancelled': return '#FF453A';
            case 'refunded': return '#8E8E93';
            default: return '#666';
        }
    };

    const handleRefund = async () => {
        if (!refunding) return;
        setRefundLoading(true);

        try {
            const res = await fetch('/api/dashboard/refund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: refunding.id }),
            });

            const data = await res.json();

            if (res.ok) {
                setToast({ message: `Refunded $${data.data.amount} — ${refunding.customer_name}`, type: 'success' });
                // Trigger parent refresh by reloading
                setTimeout(() => window.location.reload(), 2000);
            } else {
                const msg = data.error?.message || 'Refund failed';
                setToast({ message: msg, type: 'error' });
            }
        } catch {
            setToast({ message: 'Network error — please try again', type: 'error' });
        } finally {
            setRefundLoading(false);
            setRefunding(null);
        }
    };

    const canRefund = (booking) => {
        const status = booking.status?.toLowerCase();
        return status === 'confirmed' || status === 'pending';
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Recent Elite Reservations</h2>
                <div className={styles.filters}>
                    <select className={styles.filterSelect} value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All Availability</option>
                        <option value="pending">Pending Approval</option>
                        <option value="confirmed">Confirmed Elite</option>
                        <option value="refunded">Refunded</option>
                        <option value="cancelled">Cancelled</option>
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
                    {filteredBookings.map((booking) => (
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
                                        {booking.booking_date || 'No date'}
                                    </div>
                                    <div className={styles.time}>
                                        {booking.booking_time || 'No time'}
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
                                {canRefund(booking) && (
                                    <button
                                        className={styles.refundBtn}
                                        onClick={() => setRefunding(booking)}
                                        title="Refund booking"
                                    >
                                        <RotateCcw size={14} />
                                        Refund
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                        <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                No bookings found. Try booking one with Maya!
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <ConfirmModal
                booking={refunding}
                onConfirm={handleRefund}
                onCancel={() => !refundLoading && setRefunding(null)}
                loading={refundLoading}
            />

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            <style jsx>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
}

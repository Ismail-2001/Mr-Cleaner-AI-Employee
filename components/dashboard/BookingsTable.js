'use client';

import { useState } from 'react';
import styles from './BookingsTable.module.css';
import { RefreshCw, RotateCcw, X, AlertTriangle, CheckCircle, Plus } from 'lucide-react';

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

function BookingDetailModal({ booking, onClose }) {
    if (!booking) return null;

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'confirmed': return '#30D158';
            case 'pending': return '#FF9F0A';
            case 'cancelled': return '#FF453A';
            case 'refunded': return '#8E8E93';
            default: return '#666';
        }
    };

    const detailRows = [
        { label: 'Customer', value: booking.customer_name || 'N/A' },
        { label: 'Phone', value: booking.phone || 'N/A' },
        { label: 'Email', value: booking.email || 'N/A' },
        { label: 'Service', value: booking.service },
        { label: 'Vehicle', value: booking.vehicle_type || 'N/A' },
        { label: 'Date', value: booking.booking_date || 'N/A' },
        { label: 'Time', value: booking.booking_time || 'N/A' },
        { label: 'Price', value: booking.service_price ? `$${booking.service_price}` : 'N/A' },
        { label: 'Status', value: booking.status, color: getStatusColor(booking.status) },
        { label: 'Address', value: booking.address || 'N/A' },
        { label: 'Notes', value: booking.notes || 'None' },
        { label: 'Created', value: booking.created_at ? new Date(booking.created_at).toLocaleString() : 'N/A' },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '20px',
        }} onClick={onClose}>
            <div style={{
                background: '#1a1d23', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%',
                maxHeight: '80vh', overflow: 'auto',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ color: '#fff', margin: 0 }}>Booking Details</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {detailRows.map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{label}</span>
                            <span style={{ color: color || '#fff', fontSize: '0.85rem', fontWeight: color ? '600' : '400', textTransform: label === 'Status' ? 'capitalize' : 'none' }}>
                                {value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CreateBookingModal({ onClose, onCreated }) {
    const [form, setForm] = useState({
        customer_name: '', phone: '', service: '', vehicle_type: '',
        booking_date: '', booking_time: '', address: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

    const handleSubmit = async () => {
        if (!form.customer_name || !form.service || !form.booking_date || !form.booking_time) {
            setError('Name, service, date, and time are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                onCreated();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error?.message || 'Failed to create booking.');
            }
        } catch {
            setError('Network error.');
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.9rem',
        width: '100%', boxSizing: 'border-box',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '20px',
        }} onClick={onClose}>
            <div style={{
                background: '#1a1d23', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', padding: '32px', maxWidth: '480px', width: '100%',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ color: '#fff', margin: 0 }}>Create Booking</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>
                {error && (
                    <div style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '16px', color: '#FF453A', fontSize: '0.85rem' }}>
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input placeholder="Customer name *" value={form.customer_name} onChange={e => updateField('customer_name', e.target.value)} style={inputStyle} />
                    <input placeholder="Phone" value={form.phone} onChange={e => updateField('phone', e.target.value)} style={inputStyle} />
                    <input placeholder="Service *" value={form.service} onChange={e => updateField('service', e.target.value)} style={inputStyle} />
                    <input placeholder="Vehicle type" value={form.vehicle_type} onChange={e => updateField('vehicle_type', e.target.value)} style={inputStyle} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <input type="date" value={form.booking_date} onChange={e => updateField('booking_date', e.target.value)} style={inputStyle} />
                        <input type="time" value={form.booking_time} onChange={e => updateField('booking_time', e.target.value)} style={inputStyle} />
                    </div>
                    <input placeholder="Address" value={form.address} onChange={e => updateField('address', e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', cursor: 'pointer',
                    }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={loading} style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        background: loading ? 'rgba(48,209,88,0.3)' : '#30D158', color: '#fff',
                        fontSize: '0.9rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                    }}>{loading ? 'Creating...' : 'Create Booking'}</button>
                </div>
            </div>
        </div>
    );
}

const PAGE_SIZE = 10;

export default function BookingsTable({ bookings = [] }) {
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [refunding, setRefunding] = useState(null);
    const [refundLoading, setRefundLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Filter + search
    const filteredBookings = bookings
        .filter(b => filter === 'all' || b.status?.toLowerCase() === filter)
        .filter(b => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
                (b.customer_name || '').toLowerCase().includes(q) ||
                (b.phone || '').toLowerCase().includes(q) ||
                (b.service || '').toLowerCase().includes(q) ||
                (b.vehicle_type || '').toLowerCase().includes(q)
            );
        });

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paginatedBookings = filteredBookings.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    // Reset page when filter or search changes
    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPage(1);
    };

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

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
                    <input
                        type="text"
                        placeholder="Search name, phone, service..."
                        value={search}
                        onChange={handleSearchChange}
                        className={styles.searchInput}
                    />
                    <select className={styles.filterSelect} value={filter} onChange={(e) => handleFilterChange(e.target.value)}>
                        <option value="all">All Availability</option>
                        <option value="pending">Pending Approval</option>
                        <option value="confirmed">Confirmed Elite</option>
                        <option value="refunded">Refunded</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px', border: 'none',
                            background: '#30D158', color: '#fff', fontSize: '0.85rem',
                            fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        <Plus size={14} /> New Booking
                    </button>
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
                    {paginatedBookings.map((booking) => (
                        <tr key={booking.id} onClick={() => setSelectedBooking(booking)} style={{ cursor: 'pointer' }}>
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
                                {search ? 'No bookings match your search.' : 'No bookings found. Try booking one with Maya!'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {totalPages > 1 && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 0',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.85rem',
                }}>
                    <span>
                        Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredBookings.length)} of {filteredBookings.length}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: safePage <= 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
                                cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                            }}
                        >
                            Prev
                        </button>
                        <span style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.7)' }}>
                            {safePage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: safePage >= totalPages ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
                                cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                            }}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                booking={refunding}
                onConfirm={handleRefund}
                onCancel={() => !refundLoading && setRefunding(null)}
                loading={refundLoading}
            />

            <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
            {showCreateModal && (
                <CreateBookingModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => window.location.reload()}
                />
            )}

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

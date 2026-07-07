import styles from './BookingSummary.module.css';
import { Calendar, Clock, MapPin, Car, CreditCard } from 'lucide-react';

export default function BookingSummary({ data, onConfirm, onCancel }) {
    if (!data) return null;

    return (
        <div className={styles.card}>
            <header className={styles.header}>
                <div className={styles.status}>Pending Confirmation</div>
                <h3>Executive Summary</h3>
            </header>

            <div className={styles.details}>
                <div className={styles.item}>
                    <Car size={20} />
                    <div>
                        <span>Vehicle Selection</span>
                        <p>{data.vehicle_type || 'Identifying...'}</p>
                    </div>
                </div>
                <div className={styles.item}>
                    <CreditCard size={20} />
                    <div>
                        <span>Curated Service</span>
                        <p>{data.service || 'Selecting...'}</p>
                    </div>
                </div>
                <div className={styles.item}>
                    <Calendar size={20} />
                    <div>
                        <span>Arrival Date</span>
                        <p>{data.date || 'Scheduling...'}</p>
                    </div>
                </div>
                <div className={styles.item}>
                    <Clock size={20} />
                    <div>
                        <span>Appointment Time</span>
                        <p>{data.time || 'TBD'}</p>
                    </div>
                </div>
            </div>

            <div className={styles.priceSec}>
                <span>Guaranteed Estimate</span>
                <p>${data.price || data.service_price || '--'}</p>
            </div>

            <div className={styles.actions}>
                <button
                    className={styles.confirmBtn}
                    onClick={onConfirm}
                    disabled={!data.date || !data.service}
                >
                    Finalize Booking
                </button>
                <div className={styles.secondaryActions}>
                    <button className={styles.cancelBtn} onClick={onCancel}>
                        Adjust Details
                    </button>
                    <a
                        href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '15074797804'}?text=Hi, I'm booking a ${data.service} for my ${data.vehicle_type}. I have a few custom questions.`}
                        target="_blank"
                        className={styles.waBtn}
                    >
                        Speak to Specialist
                    </a>
                </div>
            </div>

            <p className={styles.note}>
                * Premium materials & water-spot-free finish guaranteed. <br />
                No advance payment. Zelle, Venmo, or Cash upon inspection.
            </p>
        </div>
    );
}

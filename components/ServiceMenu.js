import styles from './ServiceMenu.module.css';
import { Check } from 'lucide-react';

const SERVICES = [
    {
        id: 'basic',
        title: 'Executive Preservation',
        price: 'From $120',
        duration: '1.5 Hours',
        features: ['Boutique Hand Wash', 'Tire Glaze', 'Crystal Window Finish', 'Ceramic Spray Sealant'],
        color: 'var(--platinum)'
    },
    {
        id: 'premium',
        title: 'The Master Detail',
        price: 'From $250',
        duration: '3.5 Hours',
        popular: true,
        features: ['Executive features', 'Decontamination Wash', 'Single-Stage Paint Correction', 'Deep Interior Extraction', 'Leather Hydration'],
        color: 'var(--gold)'
    },
    {
        id: 'full',
        title: 'Signature Ceramic',
        price: 'From $450',
        duration: '6+ Hours',
        features: ['Master features', 'Engine Room Detailing', 'Multi-Stage Paint Correction', '3-Year Ceramic Coating', 'Fabric Protection'],
        color: 'var(--obsidian)'
    }
];

export default function ServiceMenu() {
    return (
        <section id="services" className={styles.section}>
            <div className="container">
                <div className={styles.header}>
                    <h2 className={styles.title}>Our Detailing Packages</h2>
                    <p className={styles.subtitle}>Choose the level of care your vehicle needs</p>
                </div>

                <div className={styles.grid}>
                    {SERVICES.map((service) => (
                        <div key={service.id} className={`${styles.card} ${service.popular ? styles.popular : ''}`}>
                            {service.popular && <div className={styles.popBadge}>Best Value</div>}
                            <h3 className={styles.cardTitle}>{service.title}</h3>
                            <div className={styles.priceContainer}>
                                <span className={styles.price}>{service.price}</span>
                                <span className={styles.duration}>{service.duration}</span>
                            </div>
                            <ul className={styles.features}>
                                {service.features.map((feature, i) => (
                                    <li key={i} className={styles.feature}>
                                        <Check size={18} className={styles.icon} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <button
                                className={service.popular ? styles.activeBtn : styles.btn}
                                onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { service: service.title } }))}
                            >
                                Book This Service
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

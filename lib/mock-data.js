export const MOCK_BOOKINGS = [
    {
        id: '1',
        customer_name: 'John Smith',
        phone: '555-0123',
        vehicle_type: 'SUV',
        service: 'Premium Detail',
        service_price: 225,
        booking_date: '2026-02-16',
        booking_time: '08:00 AM',
        address: '123 Austin Way, Dallas, TX',
        status: 'confirmed',
        created_at: '2026-02-14T10:00:00Z'
    },
    {
        id: '2',
        customer_name: 'Sarah Miller',
        phone: '555-4567',
        vehicle_type: 'sedan',
        service: 'Basic Wash & Wax',
        service_price: 80,
        booking_date: '2026-02-16',
        booking_time: '11:00 AM',
        address: '45 Oak Lane, Plano, TX',
        status: 'pending',
        created_at: '2026-02-15T09:30:00Z'
    },
    {
        id: '3',
        customer_name: 'Mike Jones',
        phone: '555-8899',
        vehicle_type: 'truck',
        service: 'Full Detailing',
        service_price: 375,
        booking_date: '2026-02-17',
        booking_time: '02:00 PM',
        address: '789 Ranch Rd, Frisco, TX',
        status: 'confirmed',
        created_at: '2026-02-13T14:20:00Z'
    }
];

export const MOCK_ANALYTICS = {
    totalRevenue: 2450,
    totalBookings: 12,
    customerSatisfaction: 4.9,
    revenueByDay: [
        { day: 'Mon', revenue: 450 },
        { day: 'Tue', revenue: 380 },
        { day: 'Wed', revenue: 520 },
        { day: 'Thu', revenue: 410 },
        { day: 'Fri', revenue: 690 },
        { day: 'Sat', revenue: 850 },
        { day: 'Sun', revenue: 0 }
    ],
    serviceDistribution: [
        { name: 'Basic', value: 5 },
        { name: 'Premium', value: 4 },
        { name: 'Full', value: 3 }
    ]
};

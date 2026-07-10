const http = require('http');

const data = JSON.stringify({
    customer_name: "Expert Mentor Test",
    phone: "555-4444",
    vehicle_type: "sedan",
    service: "Basic Wash & Wax",
    service_price: 80,
    booking_date: "2026-03-01",
    booking_time: "08:00 AM"
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/bookings',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('BODY:', body);
    });
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();

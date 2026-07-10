const { executeTool } = require('./lib/tools');
const { checkAvailability } = require('./lib/calendar');

async function runTests() {
    console.log("🚀 STARTING E2E LOGIC VALIDATION\n");

    // Test 1: Phone Validation & Standardization
    console.log("--- Test 1: Phone Validation ---");
    const phoneTest = await executeTool('sync_booking_state', {
        phone: '555-010-9999',
        customer_name: 'Test User'
    });
    console.log("Input: 555-010-9999");
    console.log("Output:", phoneTest);

    if (JSON.parse(phoneTest).data?.phone.startsWith('+1')) {
        console.log("✅ Phone standardized to E.164\n");
    } else {
        console.log("❌ Phone standardization failed\n");
    }

    // Test 2: Invalid Phone
    console.log("--- Test 2: Invalid Phone Rejection ---");
    const invalidPhone = await executeTool('sync_booking_state', {
        phone: '123'
    });
    console.log("Input: 123");
    console.log("Output:", invalidPhone);
    if (JSON.parse(invalidPhone).status === 'error') {
        console.log("✅ Invalid phone correctly rejected\n");
    }

    // Test 3: Duration-Aware Availability (Mock)
    console.log("--- Test 3: Duration-Aware Availability (Logic Check) ---");
    // We expect 8 slots (8 AM to 6 PM is 10 hours. 2-hour slots = (10-2)+1 = 9 possible starts at 1-hour increments)
    // 8am, 9am, 10am, 11am, 12pm, 1pm, 2pm, 3pm, 4pm (4pm start ends at 6pm)
    const availability = await checkAvailability('2026-02-23', 120);
    console.log("Date: 2026-02-23, Duration: 120m");
    console.log("Slots count:", availability.length);
    if (availability.length > 0) {
        console.log("✅ Dynamics slots generated:", availability.map(s => s.time).join(', '));
    }

    // Test 4: Extended Duration (Ceramic)
    console.log("\n--- Test 4: Extended Duration (Ceramic 8h) ---");
    const ceramicAvailability = await checkAvailability('2026-02-23', 480);
    console.log("Date: 2026-02-23, Duration: 480m (8h)");
    console.log("Slots count:", ceramicAvailability.length);
    // 8am start (ends 4pm), 9am start (ends 5pm), 10am start (ends 6pm). Total 3 slots.
    if (ceramicAvailability.length === 3) {
        console.log("✅ Duration-aware windowing matches expectations (3 slots).\n");
    } else {
        console.log("⚠️ Slots count unexpected:", ceramicAvailability.length, "(Expected 3 assuming 8am-6pm window)\n");
    }

    console.log("🎉 LOGIC VALIDATION COMPLETE");
}

runTests().catch(console.error);

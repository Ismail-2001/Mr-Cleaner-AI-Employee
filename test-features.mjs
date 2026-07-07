import { executeTool } from './lib/tools.js';
import { checkAvailability } from './lib/calendar.js';

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
    if (ceramicAvailability.length === 3) {
        console.log("✅ Duration-aware windowing matches expectations (3 slots).\n");
    } else {
        console.log("⚠️ Slots count unexpected:", ceramicAvailability.length, "(Expected 3 assuming 8am-6pm window)\n");
    }

    console.log("🎉 LOGIC VALIDATION COMPLETE");
}

runTests().catch(e => {
    console.error("Test Error:", e);
    process.exit(1);
});

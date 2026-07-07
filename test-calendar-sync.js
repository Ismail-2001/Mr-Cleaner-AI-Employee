const { checkAvailability } = require('./lib/calendar');

async function testCalendar() {
    console.log("--- Maya Calendar Integration Test ---");
    const testDate = "2026-02-16"; // Tomorrow

    try {
        console.log(`Checking availability for ${testDate}...`);
        const slots = await checkAvailability(testDate);

        console.log("SUCCESS! Results:");
        console.table(slots);

        if (slots.length > 0) {
            console.log("\n[Conclusion] The Google Calendar Auth Bridge is fully operational.");
        } else {
            console.log("\n[Alert] Connection worked, but no slots were returned. Check business hours.");
        }
    } catch (error) {
        console.error("CRITICAL TEST FAILURE:", error);
    }
}

testCalendar();

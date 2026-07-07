import { checkAvailability } from '@/lib/calendar';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date) {
        return Response.json({ error: "Date parameter required" }, { status: 400 });
    }

    const slots = await checkAvailability(date);
    return Response.json(slots);
}

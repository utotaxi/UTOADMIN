import { supabaseAdmin } from "@/lib/supabase";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingDetailsClient from "./BookingDetailsClient";
import { resolveLaterLegFare } from "@/lib/scheduled-booking-utils";

export const dynamic = "force-dynamic";

function nonEmpty(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export default async function WebBookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const bookingId = resolvedParams.id;

    // Fetch the booking
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from('web_booker')
        .select(`*, users:rider_id(full_name, email, phone)`)
        .eq('id', bookingId)
        .single();

    if (bookingError || !booking) {
        console.error("Booking not found:", bookingError);
        return notFound();
    }

    let enriched = { ...booking };

    // App scheduled rides: prefer passenger details stored on later_bookings
    // (name/email/phone), because rider_id may point at a different users row.
    if (booking.later_booking_id) {
        const { data: later } = await supabaseAdmin
            .from('later_bookings')
            .select('*')
            .eq('id', booking.later_booking_id)
            .maybeSingle();

        if (later) {
            const laterName =
                nonEmpty(later.name) ||
                [nonEmpty(later.first_name), nonEmpty(later.last_name)].filter(Boolean).join(' ') ||
                null;
            const laterEmail = nonEmpty(later.email);
            const laterPhone = nonEmpty(later.phone_number);

            enriched = {
                ...enriched,
                estimated_price: resolveLaterLegFare(later, 'single'),
                scheduled_time: later.pickup_at || enriched.scheduled_time,
                pickup_address: later.pickup_address || enriched.pickup_address,
                dropoff_address: later.dropoff_address || enriched.dropoff_address,
                assigned_driver_id: later.driver_id || enriched.assigned_driver_id,
                assigned_driver_name: later.assigned_driver_name || enriched.assigned_driver_name,
                assignment_status: later.assignment_status || null,
                passenger_name: laterName,
                passenger_email: laterEmail,
                passenger_phone: laterPhone,
                users: {
                    full_name: laterName || booking.users?.full_name || null,
                    email: laterEmail || booking.users?.email || null,
                    phone: laterPhone || booking.users?.phone || null,
                },
            };
        }
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl">
            <div className="flex items-center gap-4">
                <Link href="/web-booker/dashboard" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-muted-foreground mr-2">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        Booking Details
                    </h1>
                    <p className="text-muted-foreground text-sm">Reference: {enriched.reference || '---'}</p>
                </div>
            </div>

            <BookingDetailsClient booking={enriched} key={enriched.id} />
        </div>
    );
}

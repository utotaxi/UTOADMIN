import { supabaseAdmin } from "@/lib/supabase";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingDetailsClient from "./BookingDetailsClient";

export const dynamic = "force-dynamic";

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
                    <p className="text-muted-foreground text-sm">Reference: {booking.reference || '---'}</p>
                </div>
            </div>

            <BookingDetailsClient booking={booking} key={booking.id} />
        </div>
    );
}

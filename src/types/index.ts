export type User = {
    id: string;
    email: string;
    password?: string;
    full_name: string;
    phone?: string;
    profile_image?: string;
    role: 'admin' | 'rider' | 'driver';
    rating: number;
    total_rides: number;
    is_verified: boolean;
    stripe_customer_id?: string;
    push_token?: string;
    created_at: string;
    updated_at: string;
};

export type Driver = {
    id: string;
    user_id: string;
    vehicle_type: string;
    vehicle_make: string;
    vehicle_model: string;
    vehicle_year: number;
    vehicle_color: string;
    license_plate: string;
    is_online: boolean;
    is_available: boolean;
    current_latitude?: number;
    current_longitude?: number;
    total_earnings: number;
    created_at: string;

    // relation alias for join queries
    user?: User;
};

export type Ride = {
    id: string;
    rider_id: string;
    driver_id?: string;
    status: 'pending' | 'accepted' | 'started' | 'completed' | 'cancelled';
    vehicle_type: string;
    pickup_address: string;
    pickup_latitude: number;
    pickup_longitude: number;
    dropoff_address: string;
    dropoff_latitude: number;
    dropoff_longitude: number;
    estimated_price: number;
    final_price?: number;
    estimated_duration?: number;
    distance?: number;
    payment_status: 'pending' | 'paid' | 'failed';
    payment_intent_id?: string;
    rider_rating?: number;
    driver_rating?: number;
    requested_at: string;
    accepted_at?: string;
    started_at?: string;
    completed_at?: string;
    cancelled_at?: string;
    cancellation_reason?: string;
    /** Drivers excluded from rematch after cancelling an accepted ASAP ride. */
    excluded_driver_ids?: string[];
    rematch_count?: number;
    /** Rider-facing banner, e.g. still finding a nearby driver after cancel. */
    rider_message?: string;
    status_message?: string;

    // Relation alias
    rider?: User;
    driver?: Driver;
};

export type Payment = {
    id: string;
    ride_id: string;
    user_id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed';
    stripe_payment_intent_id?: string;
    stripe_charge_id?: string;
    payment_method?: string;
    created_at: string;
    completed_at?: string;
};

export type ServiceArea = {
    id: string;
    name: string;
    description?: string;
    area_type: 'polygon' | 'circle';
    coordinates: [number, number][]; // [lat, lng][]
    radius_meters?: number;
    color: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

"use client";

import { CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { toggleDriverApproval } from "./actions";

export default function DriverApprovalButton({ 
    userId, 
    driverId, 
    isVerified 
}: { 
    userId: string;
    driverId: string;
    isVerified: boolean;
}) {
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        setLoading(true);
        try {
            await toggleDriverApproval(userId, !isVerified, driverId);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (isVerified) {
        return (
            <button 
                onClick={handleToggle}
                disabled={loading}
                className="flex-none p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50 flex items-center justify-center"
                title="Revoke Approval"
            >
                <XCircle className="w-4 h-4" />
            </button>
        );
    }

    return (
        <button 
            onClick={handleToggle}
            disabled={loading}
            className="flex-none px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
        >
            <CheckCircle className="w-4 h-4" />
            Approve Driver
        </button>
    );
}

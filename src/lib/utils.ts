import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as dateFnsFormat } from "date-fns";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatUKDate(dateInput: Date | string | null | undefined, formatStr: string = "PPPP - p"): string {
    if (!dateInput) return '';
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return '';
        const ukTimeStr = date.toLocaleString('en-US', { timeZone: 'Europe/London' });
        const ukDate = new Date(ukTimeStr);
        return dateFnsFormat(ukDate, formatStr);
    } catch {
        return '';
    }
}

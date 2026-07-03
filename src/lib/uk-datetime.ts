export const UK_TIME_ZONE = "Europe/London";

export const UK_DATE_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
});

export const UK_DATE_NUMERIC_FORMATTER = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

export const UK_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

export const UK_REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function formatUkDateShort(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : UK_DATE_SHORT_FORMATTER.format(d);
}

export function formatUkTime(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : UK_TIME_FORMATTER.format(d);
}

export function formatUkDateNumeric(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : UK_DATE_NUMERIC_FORMATTER.format(d);
}

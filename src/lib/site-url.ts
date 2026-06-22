import { headers } from "next/headers";

/** Public site origin for auth email redirect links. */
export async function getSiteUrl(): Promise<string> {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    }

    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || "https";

    if (host) {
        return `${proto}://${host}`;
    }

    return "http://localhost:3000";
}

import "server-only";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function hasCustomEmailTransport(): boolean {
  const from =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESEND_FROM ||
    "";
  if (!from) return false;
  if (process.env.RESEND_API_KEY) return true;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return true;
  }
  return false;
}

/**
 * Optional custom email (Resend / SMTP on Railway).
 * Primary delivery uses Supabase Auth OTP email when this is not configured.
 */
export async function sendAdminEmail(
  params: SendEmailParams
): Promise<{ success: boolean; error?: string }> {
  const from =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESEND_FROM ||
    "";

  if (!from) {
    return {
      success: false,
      error:
        "Custom email is not configured. Supabase Auth email will be used when available.",
    };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[sendAdminEmail] Resend failed:", res.status, body);
        return {
          success: false,
          error: "Failed to send the PIN email. Please try again shortly.",
        };
      }
      return { success: true };
    } catch (err) {
      console.error("[sendAdminEmail] Resend error:", err);
      return {
        success: false,
        error: "Failed to send the PIN email. Please try again shortly.",
      };
    }
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    try {
      const nodemailer = await import("nodemailer");
      const port = Number(process.env.SMTP_PORT || 587);
      const secure =
        process.env.SMTP_SECURE === "true" || port === 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      return { success: true };
    } catch (err) {
      console.error("[sendAdminEmail] SMTP error:", err);
      return {
        success: false,
        error: "Failed to send the PIN email. Please try again shortly.",
      };
    }
  }

  return {
    success: false,
    error:
      "Custom email is not configured. Set RESEND_API_KEY or SMTP_* with EMAIL_FROM, or use Supabase Auth email OTP.",
  };
}

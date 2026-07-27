import "server-only";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends admin security emails via Resend and/or SMTP.
 * Configure one of:
 *   RESEND_API_KEY + EMAIL_FROM
 *   SMTP_HOST + SMTP_USER + SMTP_PASS + EMAIL_FROM
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
        "Email is not configured. Set EMAIL_FROM and either RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS on the server.",
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
      "Email is not configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS (with EMAIL_FROM) on Railway.",
  };
}

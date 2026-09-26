import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const REFERRAL_WEBHOOK_SECRET = Deno.env.get("REFERRAL_WEBHOOK_SECRET") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

const NOTIFICATION_RECIPIENTS = [
  "luca@simpleza.co.za",
];

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a), bufB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] || c));
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  // 1. Strict Auth Guard
  const webhookHeader = req.headers.get("x-webhook-secret") || "";
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "") ||
    "";

  const isAuthorized =
    (REFERRAL_WEBHOOK_SECRET.length > 0 &&
      timingSafeEqual(webhookHeader, REFERRAL_WEBHOOK_SECRET)) ||
    (SUPABASE_SERVICE_ROLE_KEY.length > 0 &&
      timingSafeEqual(authHeader, SUPABASE_SERVICE_ROLE_KEY));

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();

    // 2. Ignore non-insert events
    if (payload.type && payload.type !== "INSERT") {
      return new Response(JSON.stringify({ status: "ignored_non_insert" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const record = payload.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "Missing record payload" }), {
        status: 400,
      });
    }

    // 3. Raw values for validation
    const rawEmail = String(record.contact_email || "").trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    const replyToAddress = isValidEmail
      ? rawEmail
      : "luca@simpleza.co.za";

    // 4. Sanitize all user-controlled text for HTML rendering
    const processorName = escapeHtml(
      record.processor_name || "Unknown Processor",
    );
    const contactPerson = escapeHtml(record.contact_person || "Not provided");
    const contactEmail = escapeHtml(rawEmail || "Not provided");
    const contactPhone = escapeHtml(record.contact_phone || "Not provided");
    const cropName = escapeHtml(record.crop_name || "Unspecified Crop");
    const referralNotes = escapeHtml(record.notes || "None provided").replace(
      /\n/g,
      "<br/>",
    );

    if (RESEND_API_KEY) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "The Vault Alerts <alerts@simpleza.co.za>",
          reply_to: replyToAddress,
          to: NOTIFICATION_RECIPIENTS,
          subject: `🌾 New Processor Referral: ${processorName} (${cropName})`,
          html: `
            <!DOCTYPE html>
            <html>
            <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 32px 12px;">
                <tr>
                  <td align="center">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                      <tr>
                        <td style="background-color: #1e3a5f; padding: 24px 32px;">
                          <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-family: Georgia, serif;">New Corporate Referral Lead</h2>
                          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">The Vault Commercial Pipeline</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 32px;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Target Processor:</strong> ${processorName}</p>
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Crop Pack:</strong> ${cropName}</p>
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Contact Person:</strong> ${contactPerson}</p>
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Email:</strong> ${contactEmail}</p>
                                <p style="margin: 0; font-size: 12px; color: #64748b;"><strong>Phone:</strong> ${contactPhone}</p>
                              </td>
                            </tr>
                          </table>
                          <div style="font-size: 13px; color: #334155; line-height: 1.5; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <strong>Notes / Submission Context:</strong><br/>
                            ${referralNotes}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error("[Resend Error in notify-referral-lead]:", errText);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500 },
    );
  }
});

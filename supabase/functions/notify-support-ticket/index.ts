import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const NOTIFICATION_RECIPIENTS = [
  "luca@simpleza.co.za",
];

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const payload = await req.json();

    // Ensure it was an insert event
    if (payload.type && payload.type !== "INSERT") {
      return new Response(JSON.stringify({ status: "ignored_non_insert" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const ticket = payload.record;
    if (!ticket) {
      return new Response(JSON.stringify({ error: "No record found in payload" }), { status: 400 });
    }

    const ticketTypeFormatted = (ticket.ticket_type || "General")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    if (RESEND_API_KEY) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "The Vault Support <alerts@simpleza.co.za>",
          reply_to: ticket.user_email,
          to: NOTIFICATION_RECIPIENTS,
          subject: `🚨 [Support Ticket] ${ticketTypeFormatted}: ${ticket.subject}`,
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
                          <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-family: Georgia, serif;">New Support Ticket Received</h2>
                          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">The Vault Helpdesk</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 32px;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 24px;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Submitted By:</strong> ${ticket.user_name || "User"} (${ticket.user_email})</p>
                                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;"><strong>Category:</strong> ${ticketTypeFormatted}</p>
                                <p style="margin: 0; font-size: 12px; color: #64748b;"><strong>Subject:</strong> ${ticket.subject}</p>
                              </td>
                            </tr>
                          </table>
                          <div style="font-size: 14px; line-height: 1.6; color: #1e293b; background: #ffffff; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            ${ticket.message.replace(/\n/g, "<br/>")}
                          </div>
                          <p style="margin-top: 24px; font-size: 12px; color: #64748b; text-align: center;">
                            Hit <strong>Reply</strong> to respond directly to ${ticket.user_email}.
                          </p>
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
        console.error("[Resend Error]:", errText);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
});
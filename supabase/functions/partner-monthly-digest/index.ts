import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ||
  "https://www.simpleza.co.za/partner-portal.html";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  // 1. Strict Auth Guard: Refuse all requests if CRON_SECRET is missing (Item A)
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret");

  const isAuthorized = CRON_SECRET.length > 0 &&
    ((cronHeader && cronHeader === CRON_SECRET) ||
      (authHeader && authHeader === SUPABASE_SERVICE_ROLE_KEY));

  if (!isAuthorized) {
    if (!CRON_SECRET) {
      console.error(
        "[partner-monthly-digest] CRON_SECRET is missing! Refusing execution.",
      );
    }
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: partners, error: pErr } = await supabase
      .from("corporate_partners")
      .select("id, name, contact_email, slug, sponsored_crop_pack, logo_url");

    if (pErr) throw pErr;

    const results = [];

    // 2. Loop with per-partner isolation and DB error checks (Item E)
    for (const partner of partners || []) {
      if (!partner.contact_email) continue;

      try {
        // Revoke prior tokens
        const { error: revokeErr } = await supabase
          .from("partner_portal_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("partner_id", partner.id)
          .is("revoked_at", null);

        if (revokeErr) throw revokeErr;

        // Mint fresh 35-day token
        const tokenUuid = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
          .toISOString();

        const { error: insertErr } = await supabase
          .from("partner_portal_tokens")
          .insert({
            partner_id: partner.id,
            token: tokenUuid,
            expires_at: expiresAt,
          });

        if (insertErr) throw insertErr;

        const magicLink = `${PORTAL_BASE_URL}?token=${tokenUuid}`;

        if (RESEND_API_KEY) {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "Simple Solutions <compliance@simpleza.co.za>",
              reply_to: "luca@simpleza.co.za",
              to: partner.contact_email,
              subject: `Supply Chain Compliance Digest: ${partner.name}`,
              html: `
                <!DOCTYPE html>
                <html>
                <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 12px;">
                    <tr>
                      <td align="center">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                          <tr>
                            <td style="background-color: #1e3a5f; padding: 28px 36px; text-align: left;">
                              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                  <td style="width: 46px; vertical-align: middle;">
                                    <table cellpadding="0" cellspacing="0" border="0" style="width: 44px; height: 44px; background-color: #ffffff; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.4); border-collapse: separate; overflow: hidden;">
                                      <tr>
                                        <td align="center" valign="middle" style="width: 44px; height: 44px; text-align: center; vertical-align: middle; padding: 0;">
                                          <img src="https://www.simpleza.co.za/assets/branding/Simple_Logo-removebg-preview.png" width="32" height="32" style="width: 32px; height: 32px; object-fit: contain; display: block; margin: 0 auto; border: 0; outline: none;" alt="Simple Solutions" />
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td style="padding-left: 14px; vertical-align: middle;">
                                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; font-family: Georgia, serif; display: block; line-height: 1.2;">The Vault</span>
                                    <span style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-top: 2px;">Supply Chain Compliance</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 40px 40px 32px 40px;">
                              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px;">Monthly Audit Dispatch</p>
                              <h1 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                                Grower Network Compliance: <span style="color: #1e3a5f;">${partner.name}</span>
                              </h1>
                              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                The statutory risk registers, Baseline Risk Assessment (BRA) statuses, and rolling 90-day worker safety certifications have been compiled for your registered supplying estates.
                              </p>
                              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 24px 0;">
                                <tr>
                                  <td style="padding: 16px 20px;">
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                      <tr>
                                        <td width="50%" style="border-right: 1px solid #e2e8f0; padding-right: 16px;">
                                          <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Sponsored Pack</div>
                                          <div style="font-size: 15px; font-weight: 700; color: #1e3a5f; margin-top: 2px;">${partner.sponsored_crop_pack}</div>
                                        </td>
                                        <td width="50%" style="padding-left: 16px;">
                                          <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Access Session</div>
                                          <div style="font-size: 15px; font-weight: 700; color: #059669; margin-top: 2px;">Verified Active (35 Days)</div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              <div style="margin: 32px 0 24px 0; text-align: center;">
                                <a href="${magicLink}" style="background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 700; display: inline-block; box-shadow: 0 4px 8px rgba(30, 58, 95, 0.25);">
                                  Open Partner Compliance Portal &rarr;
                                </a>
                              </div>
                              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center;">
                                Zero-login encrypted magic link. One-click statutory PDF certificates and CSV audit registers are available directly in your dashboard view.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #64748b;">
                                Powered by <a href="https://www.simpleza.co.za" style="color: #1e3a5f; text-decoration: underline; font-weight: 700;">Simple Solutions Safety &amp; Operations</a>
                              </p>
                              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                                POPIA Sec 14 / GDPR Protected • Stellenbosch, Western Cape
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
            const errBody = await emailRes.text();
            console.error(`[Resend Error for ${partner.name}]:`, errBody);
          }
        }

        results.push({
          partner: partner.name,
          email: partner.contact_email,
          token: tokenUuid,
        });
      } catch (partnerErr) {
        console.error(
          `[Digest] Execution failed for partner ${partner.name}:`,
          partnerErr,
        );
        results.push({
          partner: partner.name,
          email: partner.contact_email,
          error: String(partnerErr),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: results.length,
        details: results,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

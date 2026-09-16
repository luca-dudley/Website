import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ||
  "https://simplesolutions.co.za/partner-portal.html";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  // 1. Guard endpoint with secret header
  if (CRON_SECRET) {
    const authHeader = req.headers.get("x-cron-secret");
    if (authHeader !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: partners, error: pErr } = await supabase
      .from("corporate_partners")
      .select("id, name, contact_email, slug, sponsored_crop_pack");

    if (pErr) throw pErr;

    const results = [];

    for (const partner of partners || []) {
      if (!partner.contact_email) continue;

      // 2. Revoke any previous active tokens for this partner
      await supabase
        .from("partner_portal_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("partner_id", partner.id)
        .is("revoked_at", null);

      // 3. Mint a fresh token valid for 35 days
      const tokenUuid = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
        .toISOString();

      await supabase.from("partner_portal_tokens").insert({
        partner_id: partner.id,
        token: tokenUuid,
        expires_at: expiresAt,
      });

      const magicLink = `${PORTAL_BASE_URL}?token=${tokenUuid}`;

      if (RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Simple Solutions <compliance@simpleza.co.za>",
            reply_to: "simple.lucadudley@gmail.com",
            to: partner.contact_email,
            subject: `Monthly Supply Chain Compliance Digest - ${partner.name}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
                <h2 style="color: #1e3a5f;">Monthly Compliance Digest: ${partner.name}</h2>
                <p>Grower compliance data for your ${partner.sponsored_crop_pack} network is compiled and ready for audit review.</p>
                <div style="margin: 24px 0;">
                  <a href="${magicLink}" style="background-color: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Open Compliance Dashboard &rarr;
                  </a>
                </div>
                <p style="font-size: 12px; color: #64748b;">Link is valid for 35 days. Confidential supply chain data.</p>
              </div>
            `,
          }),
        });
      }

      results.push({
        partner: partner.name,
        email: partner.contact_email,
        token: tokenUuid,
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: results.length }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500 },
    );
  }
});

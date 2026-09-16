import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFICATION_RECIPIENTS = [
  "simple.lucadudley@gmail.com",
];

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record; // The inserted row from processor_referral_leads

    if (!record) {
      return new Response(
        JSON.stringify({ error: "No record found in payload" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Supabase Admin client to fetch farm & user context
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1. Fetch Company Name
    let companyName = "Unknown Estate / Packhouse";
    if (record.company_id) {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", record.company_id)
        .maybeSingle();
      if (comp?.name) companyName = comp.name;
    }

    // 2. Fetch User Profile
    let userName = "Unknown User";
    let userEmail = "Not available";
    if (record.user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", record.user_id)
        .maybeSingle();

      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
        record.user_id,
      );
      if (prof) {
        userName = `${prof.first_name || ""} ${prof.last_name || ""}`.trim();
      }
      if (authUser?.user?.email) userEmail = authUser.user.email;
    }

    const cropName = record.crop_name || "General";
    const processorName = record.processor_name || "Unspecified Processor";

    // 3. Send Email via Resend
    if (!RESEND_API_KEY) {
      console.warn(
        "[Referral Function] RESEND_API_KEY missing. Lead logged to console only:",
      );
      console.log({
        companyName,
        userName,
        userEmail,
        cropName,
        processorName,
      });
      return new Response(JSON.stringify({ status: "logged_no_email_key" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "The Vault Alerts <alerts@simpleza.co.za>",
        reply_to: "simple.lucadudley@gmail.com",
        to: NOTIFICATION_RECIPIENTS,
        subject: `🌾 New Processor Referral: ${processorName} (${cropName})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #1e3a5f; margin-top: 0;">New Processor Sponsorship Lead</h2>
            <p style="font-size: 14px; color: #475569;">A grower on The Vault just requested processor sponsorship for a locked crop pack:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; font-weight: bold; color: #1e3a5f; width: 140px;">Processor / Co-op:</td>
                <td style="padding: 10px 0; color: #0f172a; font-weight: bold; font-size: 15px;">${processorName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; font-weight: bold; color: #1e3a5f;">Crop Pack:</td>
                <td style="padding: 10px 0; color: #0f172a;">${cropName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; font-weight: bold; color: #1e3a5f;">Estate / Company:</td>
                <td style="padding: 10px 0; color: #0f172a;">${companyName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; font-weight: bold; color: #1e3a5f;">Referred By:</td>
                <td style="padding: 10px 0; color: #0f172a;">${userName} (<a href="mailto:${userEmail}">${userEmail}</a>)</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #1e3a5f;">Timestamp:</td>
                <td style="padding: 10px 0; color: #64748b;">${
          new Date().toLocaleString("en-ZA", {
            timeZone: "Africa/Johannesburg",
          })
        } SAST</td>
              </tr>
            </table>

            <div style="background-color: #f8fafc; padding: 14px; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #cbd5e1;">
              <strong>Action Item:</strong> Contact the commercial rep or farm liaison at <em>${processorName}</em> to pitch the 25% subsidy bulk program for ${companyName} and their grower base.
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend API Error: ${errBody}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Referral Function Error]:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

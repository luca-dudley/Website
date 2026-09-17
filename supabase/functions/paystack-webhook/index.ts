import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

// Verify Paystack HMAC SHA512 signature
async function verifySignature(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature || !PAYSTACK_SECRET) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYSTACK_SECRET),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign", "verify"],
  );

  const calculatedSig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const hashArray = Array.from(new Uint8Array(calculatedSig));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

  return hexHash === signature;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-paystack-signature");
    const rawBody = await req.text();

    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      console.error("[Paystack Webhook] Invalid HMAC signature");
      return new Response("Unauthorized signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    console.log(`[Paystack Webhook] Event received: ${event.event}`);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Event 1: A recurring subscription was created (Capture the recurring SUB code)
    if (event.event === "subscription.create") {
      const data = event.data;
      const metadata = data.metadata || {};
      const companyId = metadata.company_id;
      const cropPack = metadata.crop_pack;
      const subCode = data.subscription_code;
      const emailToken = data.email_token;

      if (companyId && cropPack && subCode) {
        console.log(
          `[Paystack Webhook] Capturing bolt-on for company ${companyId}, crop ${cropPack}`,
        );

        const { error } = await supabaseAdmin
          .from("crop_pack_addon_subscriptions")
          .upsert(
            {
              company_id: companyId,
              crop_name: cropPack,
              paystack_subscription_code: subCode,
              paystack_email_token: emailToken,
              status: "active",
            },
            { onConflict: "company_id,crop_name" },
          );

        if (error) {
          console.error("[Paystack Webhook] Upsert error:", error.message);
        }
      }
    }

    // Event 1b: A one-time crop-pack add-on purchase completed.
    // This is the server-side replacement for the old client-side
    // `dbClient.rpc('purchase_crop_pack_addon', ...)` call. The RPC is now
    // GRANTed to service_role only, so this webhook (running with
    // SUPABASE_SERVICE_ROLE_KEY) is the only caller that can ever unlock a
    // crop pack — a browser console can no longer invoke it directly.
    //
    // Not every charge.success event is a crop-pack purchase (plan upgrades
    // and other charges flow through the same event type), so only act when
    // the metadata this specific checkout sets is actually present.
    if (event.event === "charge.success") {
      const data = event.data;
      const metadata = data.metadata || {};
      const companyId = metadata.company_id;
      const userId = metadata.user_id || null;
      const cropName = metadata.crop_name;
      const paystackRef = data.reference;

      if (companyId && cropName && paystackRef) {
        console.log(
          `[Paystack Webhook] Crediting crop pack "${cropName}" for company ${companyId} (ref: ${paystackRef})`,
        );

        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
          "purchase_crop_pack_addon",
          {
            p_company_id: companyId,
            p_user_id: userId,
            p_crop_name: cropName,
            p_paystack_ref: paystackRef,
          },
        );

        if (rpcError) {
          // Log and swallow rather than throw. The RPC is idempotent on
          // paystack_ref (on conflict do nothing), so a Paystack retry of
          // this same webhook is always safe to re-run. Returning a
          // non-2xx here would just cause Paystack to keep retrying a
          // payload that likely needs a human to look at the logs (e.g.
          // metadata.company_id pointing at a user_id from a different
          // company — the RPC rejects that mismatch by design).
          console.error(
            "[Paystack Webhook] purchase_crop_pack_addon RPC error:",
            rpcError.message,
          );
        } else {
          console.log(
            "[Paystack Webhook] Crop pack purchase result:",
            JSON.stringify(rpcData),
          );
        }
      }
    }

    // Event 2: Opportunistic drain of the cancellation queue
    const { data: pendingCancellations } = await supabaseAdmin
      .from("crop_pack_addon_subscriptions")
      .select("*")
      .eq("status", "pending_cancellation")
      .not("paystack_subscription_code", "is", null);

    if (pendingCancellations && pendingCancellations.length > 0) {
      for (const row of pendingCancellations) {
        console.log(
          `[Paystack Webhook] Disabling subscription ${row.paystack_subscription_code}...`,
        );

        const disableRes = await fetch(
          "https://api.paystack.co/subscription/disable",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: row.paystack_subscription_code,
              token: row.paystack_email_token,
            }),
          },
        );

        if (disableRes.ok) {
          await supabaseAdmin
            .from("crop_pack_addon_subscriptions")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          console.log(
            `[Paystack Webhook] Successfully cancelled ${row.paystack_subscription_code}`,
          );
        } else {
          console.error(
            `[Paystack Webhook] Failed to disable ${row.paystack_subscription_code}`,
          );
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[Paystack Webhook] Execution error:", err.message);
    return new Response(err.message, { status: 500 });
  }
});

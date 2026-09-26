---
name: supabase-security
description: Enforces multi-tenant row-level security and Deno edge function conventions.
---
# Supabase Database & Security Protocol
1. **Multi-Tenancy**: Every table query and RPC must enforce `organization_id`. Ensure RLS policies match:
   `auth.jwt() ->> 'organization_id' = organization_id`
2. **Edge Functions (`/supabase/functions/`)**:
   - Runtime: Deno ES modules.
   - Always handle CORS preflight headers (`OPTIONS`).
   - Validate incoming Paystack signatures using HMAC SHA512.
3. **Environment**: Never expose service keys on client interfaces. Client interactions use the public anon key.

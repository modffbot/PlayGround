import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return store.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options)); }
          catch { /* called from Server Component - ignore */ }
        },
      },
    }
  );
}

/** Admin client (service role) - SERVER ONLY. Never import in client components. */
export function createAdminClient() {
  const { createClient: createSupabase } = require("@supabase/supabase-js");
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

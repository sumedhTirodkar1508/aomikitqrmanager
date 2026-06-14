import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client (service role).
 *
 * SECURITY: This module uses the SUPABASE_SERVICE_ROLE_KEY and must ONLY be
 * imported from Server Actions or Route Handlers — NEVER from a client
 * component. The service role key bypasses Row Level Security.
 */

export const PRODUCT_IMAGES_BUCKET = "product-images";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/** Resolve the public URL for an object in the product-images bucket. */
export function productImagePublicUrl(path: string): string {
  const { data } = getSupabaseAdmin()
    .storage.from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

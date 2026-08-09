import { createServerClient } from '@supabase/ssr';

/**
 * Server-side Supabase client (SERVICE ROLE — bypasses RLS).
 *
 * In a Next.js request this reads the request's cookies via `next/headers`,
 * exactly as before. But Popper authenticates with the SERVICE_ROLE key, which
 * bypasses RLS entirely, so cookies are not actually required for data access —
 * they only carry a user auth session we don't use server-side.
 *
 * We therefore make cookie access OPTIONAL: if `cookies()` has no request scope
 * (e.g. when the same server code is invoked from a plain Node/tsx process such
 * as `scripts/eval-verifier.ts`), it throws — we catch that and fall back to
 * no-op cookie handlers. This lets the SAME production code paths (callLlm,
 * runVerifier, budget checks, trace logging) run unchanged from a script, which
 * is what makes the frozen verifier evaluation a faithful "live code path" test
 * rather than a re-implementation.
 */
export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof import('next/headers')['cookies']>> | null = null;
  try {
    const { cookies } = await import('next/headers');
    cookieStore = await cookies();
  } catch {
    // No request scope (script / non-Next runtime). Service role needs no cookies.
    cookieStore = null;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore ? cookieStore.getAll() : [];
        },
        setAll(cookiesToSet) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore!.set(name, value, options);
            });
          } catch {
            // Server component — cookie setting ignored
          }
        },
      },
    }
  );
}

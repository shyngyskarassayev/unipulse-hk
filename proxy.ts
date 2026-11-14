import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Keeps the Supabase session cookie fresh on every request. Access control
 * itself lives in the pages and in the database policies.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Reading the claims refreshes an expired session. The token's signature is
  // checked locally against the project's public keys, so this normally costs
  // no network round trip.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the cron endpoint.
    "/((?!_next/static|_next/image|favicon.ico|api/agent|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

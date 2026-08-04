import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

// Every Supabase call in this codebase destructures { data, error } and throws on
// error before touching data — this collapses that pair into one call. Takes data
// and error as two separate arguments rather than one destructured object: passing
// Supabase's response object directly defeats TypeScript's generic inference (it's a
// discriminated union — data: T with error: null, or data: null with error:
// PostgrestError — and inference through a single union-shaped argument widens T
// to include null regardless). The `as T` asserts the same invariant call sites
// already relied on before this helper existed: once error is ruled out, data is
// never actually null for a real row lookup (`.maybeSingle()` callers already
// handle a legitimately-absent row via `data?.` on the result).
export function unwrap<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw error;
  return data as T;
}

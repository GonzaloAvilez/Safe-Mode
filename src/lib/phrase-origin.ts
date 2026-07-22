// No dependencies on purpose — this file must be safe to import from client components
// (the two submission forms) as well as server code (the API route, phrases.ts). Anything
// that pulls in supabase.ts or openai.ts (both guarded by `import "server-only"`) would
// break the client build the moment a form imported it, even indirectly.

export const LEAVE_A_TRACE_ORIGIN = "leave_a_trace";
export const CONTRIBUTE_ORIGIN = "contribute";
export type PhraseOrigin = typeof LEAVE_A_TRACE_ORIGIN | typeof CONTRIBUTE_ORIGIN;

export const PHRASE_ORIGINS = [LEAVE_A_TRACE_ORIGIN, CONTRIBUTE_ORIGIN];
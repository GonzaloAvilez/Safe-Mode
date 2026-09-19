-- Contract step of the expand-contract migration from 20260902121000, which added the
-- three-argument match_phrase(vector, text, double precision) and kept the deployed
-- two-argument match_phrase(vector, text) alive so app and schema deploys didn't have
-- to be atomic. Verified in src/lib/phrases.ts that findClosestPhrase has called only
-- the three-argument RPC since that migration landed, so the two-argument overload is
-- confirmed dead. Leaving it live is a real hazard, not just clutter: it lets a caller
-- bypass the per-language calibrated threshold entirely (see
-- 20260728220000_drop_match_phrase_old_overload.sql for the prior instance of this
-- same class of gotcha).

drop function if exists match_phrase(vector(1536), text);

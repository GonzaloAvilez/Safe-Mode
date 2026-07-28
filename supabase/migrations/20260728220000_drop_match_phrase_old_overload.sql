-- Contract step of the expand-contract migration for match_phrase's language filter
-- (20260720190000). The expand step deliberately kept both overloads alive
-- (match_phrase(vector) and match_phrase(vector, text)) so app code deploys and schema
-- deploys didn't have to be atomic. App code has called only the 2-arg version since
-- Section 2 (2026-07-20) and this has been live in production since, so the 1-arg
-- overload is confirmed dead: verified live against production (2026-07-28) that no
-- migration ever dropped it and that it was still directly callable, unfiltered by
-- language and still using the stale 0.5 threshold. Leaving it live is a real hazard,
-- not just clutter — see postgres-function-signature-change-requires-drop in
-- learning/knowledge-graph.md.

drop function if exists match_phrase(vector(1536));

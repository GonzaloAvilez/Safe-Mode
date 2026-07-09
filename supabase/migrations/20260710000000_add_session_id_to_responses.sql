-- Groundwork for a minimal anonymous session (P3 of #20): lets a future PATCH on
-- responses (to set scale_after / wants_reply) verify the caller's session actually
-- owns the row, instead of being wide open. The session itself carries no identity —
-- it's just a signed, anonymous cookie value.

alter table responses
  add column session_id uuid;

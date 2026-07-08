-- Split the general moderation flag from the self-harm-specific crisis signal.
-- flagged_crisis (self-harm categories only) decides whether to redirect to findahelpline.com.
-- flagged_general (any other moderation category) decides whether to show a different message.

alter table entries
  drop column flagged;

alter table entries
  add column flagged_crisis boolean not null default false,
  add column flagged_general boolean not null default false;

-- No user phrase may enter the public corpus until the Moderation API approves it.
-- moderation_status is the source of truth; active is derived from it.

alter table phrases
  add column moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected'));

alter table phrases
  alter column active set default false;

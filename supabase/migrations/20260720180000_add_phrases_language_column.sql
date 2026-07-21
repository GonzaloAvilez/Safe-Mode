-- Add a language tag to phrases, so matching can be scoped to same-language pairs
-- (text-embedding-3-small's cross-lingual similarity is measurably weaker than
-- same-language — see ROADMAP.md "Open/deferred").
--
-- Added column language and mapping existing columns setting up default language 'en'

alter table phrases
  add column language text not null default 'en';


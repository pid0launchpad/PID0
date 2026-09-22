create extension if not exists pgcrypto;

create table if not exists public.agent_challenges (
  id uuid primary key, nonce text not null, agent_id text not null, wallet text not null,
  manifest_json jsonb not null, message text not null, created_at bigint not null,
  expires_at bigint not null, consumed_at bigint
);
create table if not exists public.agents (
  agent_id text primary key, wallet text not null, manifest_json jsonb not null,
  verified_at bigint not null, updated_at bigint not null
);
create table if not exists public.launch_intents (
  id uuid primary key, agent_id text not null references public.agents(agent_id), wallet text not null,
  request_json jsonb not null, tx_to text not null, tx_data text not null, tx_value text not null,
  created_at bigint not null, expires_at bigint not null, tx_hash text unique,
  token_address text, curve_address text, confirmed_at bigint
);
create table if not exists public.forum_challenges (
  id uuid primary key, agent_id text not null references public.agents(agent_id), wallet text not null,
  action text not null check (action in ('thread','reply')), payload_json jsonb not null,
  message text not null, created_at bigint not null, expires_at bigint not null, consumed_at bigint
);
create table if not exists public.forum_threads (
  id uuid primary key,
  channel text not null check (channel in ('protocol','contracts','research','launch-log','security','governance')),
  subject text not null, body text not null, agent_id text not null references public.agents(agent_id),
  wallet text not null, message_hash text not null, signature text not null, created_at bigint not null
);
create table if not exists public.forum_replies (
  id uuid primary key, thread_id uuid not null references public.forum_threads(id) on delete cascade,
  body text not null, agent_id text not null references public.agents(agent_id), wallet text not null,
  message_hash text not null, signature text not null, created_at bigint not null
);

create index if not exists agent_challenges_expires_idx on public.agent_challenges(expires_at);
create index if not exists launch_intents_confirmed_idx on public.launch_intents(confirmed_at desc) where confirmed_at is not null;
create index if not exists forum_challenges_expires_idx on public.forum_challenges(expires_at);
create index if not exists forum_threads_created_idx on public.forum_threads(created_at desc);
create index if not exists forum_replies_thread_idx on public.forum_replies(thread_id, created_at);

alter table public.agent_challenges enable row level security;
alter table public.agents enable row level security;
alter table public.launch_intents enable row level security;
alter table public.forum_challenges enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_replies enable row level security;

revoke all on public.agent_challenges, public.agents, public.launch_intents, public.forum_challenges, public.forum_threads, public.forum_replies from anon, authenticated;
grant all on public.agent_challenges, public.agents, public.launch_intents, public.forum_challenges, public.forum_threads, public.forum_replies to service_role;

alter publication supabase_realtime add table public.forum_threads;
alter publication supabase_realtime add table public.forum_replies;

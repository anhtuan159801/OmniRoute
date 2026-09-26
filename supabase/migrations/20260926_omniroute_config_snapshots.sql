create table if not exists public.omniroute_config_snapshots (
  instance_id text primary key check (instance_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  format_version integer not null check (format_version = 1),
  revision bigint not null check (revision > 0),
  ciphertext text not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

alter table public.omniroute_config_snapshots enable row level security;
revoke all on table public.omniroute_config_snapshots from anon, authenticated;
grant select, insert, update on table public.omniroute_config_snapshots to service_role;

create or replace function public.upsert_omniroute_config_snapshot(
  p_instance_id text, p_expected_revision bigint, p_format_version integer,
  p_revision bigint, p_ciphertext text, p_checksum text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  update omniroute_config_snapshots set format_version = p_format_version, revision = p_revision,
    ciphertext = p_ciphertext, checksum = p_checksum, updated_at = now()
    where instance_id = p_instance_id and revision = p_expected_revision;
  if found then return; end if;
  if p_expected_revision = 0 then
    insert into omniroute_config_snapshots(instance_id, format_version, revision, ciphertext, checksum)
    values (p_instance_id, p_format_version, p_revision, p_ciphertext, p_checksum)
    on conflict (instance_id) do nothing;
    if found then return; end if;
  end if;
  raise exception 'snapshot revision conflict' using errcode = '40001';
end;
$$;
revoke all on function public.upsert_omniroute_config_snapshot(text, bigint, integer, bigint, text, text) from public;
grant execute on function public.upsert_omniroute_config_snapshot(text, bigint, integer, bigint, text, text) to service_role;

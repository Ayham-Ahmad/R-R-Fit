-- Coach "About me" page
--   * bio + flexible social links on the singleton platform_settings row
--   * optional coach profile photo
--   * certificates (image or PDF) stored in a private bucket
--
-- platform_settings is already readable by every authenticated user, so bio,
-- links and photo path are visible to trainees without extra policies.
-- Certificates live in their own table and are readable by authenticated users.

begin;

-- ---------------------------------------------------------------------------
-- Coach about fields
-- ---------------------------------------------------------------------------
alter table public.platform_settings
  add column if not exists coach_bio_en text not null default '',
  add column if not exists coach_bio_ar text not null default '',
  add column if not exists coach_avatar_path text,
  add column if not exists coach_links jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Certificates
-- Each row points at one file in the private coach-media bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.coach_certificates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title_en text not null default '',
  title_ar text not null default '',
  description_en text not null default '',
  description_ar text not null default '',
  file_path text not null,
  file_name text not null default '',
  mime_type text not null check (mime_type in ('image/webp', 'image/jpeg', 'image/png', 'application/pdf')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coach_certificates_coach_idx
  on public.coach_certificates (coach_id, sort_order, created_at);

alter table public.coach_certificates enable row level security;

drop policy if exists "coach_certificates_read_authenticated" on public.coach_certificates;
create policy "coach_certificates_read_authenticated"
on public.coach_certificates for select
to authenticated
using (true);

drop policy if exists "coach_certificates_write_owner" on public.coach_certificates;
create policy "coach_certificates_write_owner"
on public.coach_certificates for all
to authenticated
using (coach_id = auth.uid() and public.is_coach_or_admin())
with check (coach_id = auth.uid() and public.is_coach_or_admin());

-- ---------------------------------------------------------------------------
-- Private coach media bucket (profile photo + certificates)
-- 25 MB keeps full-resolution certificate scans and multi-page PDFs usable.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-media',
  'coach-media',
  false,
  26214400,
  array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];

-- Trainees may read every coach file; only the owning coach may write.
drop policy if exists "coach_media_read_authenticated" on storage.objects;
create policy "coach_media_read_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'coach-media');

drop policy if exists "coach_media_insert_owner" on storage.objects;
create policy "coach_media_insert_owner"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "coach_media_update_owner" on storage.objects;
create policy "coach_media_update_owner"
on storage.objects for update
to authenticated
using (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "coach_media_delete_owner" on storage.objects;
create policy "coach_media_delete_owner"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

create or replace function public.sync_coach_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.coach_name_en is not distinct from old.coach_name_en
     and new.coach_name_ar is not distinct from old.coach_name_ar
     and new.whatsapp_phone is not distinct from old.whatsapp_phone then
    return new;
  end if;

  update public.profiles
  set name_en = new.coach_name_en,
      name_ar = new.coach_name_ar,
      whatsapp_phone = nullif(new.whatsapp_phone, '')
  where id = auth.uid()
    and role = 'coach';

  return new;
end;
$$;

drop trigger if exists platform_settings_sync_coach_identity on public.platform_settings;
create trigger platform_settings_sync_coach_identity
after update of coach_name_en, coach_name_ar, whatsapp_phone on public.platform_settings
for each row execute function public.sync_coach_profile_identity();

update public.profiles p
set name_en = coalesce(nullif(s.coach_name_en, ''), p.name_en),
    name_ar = coalesce(nullif(s.coach_name_ar, ''), p.name_ar),
    whatsapp_phone = coalesce(nullif(s.whatsapp_phone, ''), p.whatsapp_phone)
from public.platform_settings s
where s.id = 1
  and p.role = 'coach'
  and (
    p.name_en is distinct from coalesce(nullif(s.coach_name_en, ''), p.name_en)
    or p.name_ar is distinct from coalesce(nullif(s.coach_name_ar, ''), p.name_ar)
    or p.whatsapp_phone is distinct from coalesce(nullif(s.whatsapp_phone, ''), p.whatsapp_phone)
  );

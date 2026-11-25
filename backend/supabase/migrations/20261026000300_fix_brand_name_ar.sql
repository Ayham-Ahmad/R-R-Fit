-- Correct the archived Arabic brand spelling. The protective trigger is
-- disabled only for the duration of this transaction and is always restored.

begin;

alter table public.platform_settings disable trigger platform_settings_protect_fields;

do $$
begin
  update public.platform_settings
  set website_name_ar = 'رنا رويال فتنيس'
  where website_name_ar = 'رانا رويال فتنيس';

  alter table public.platform_settings enable trigger platform_settings_protect_fields;
exception
  when others then
    alter table public.platform_settings enable trigger platform_settings_protect_fields;
    raise;
end $$;

commit;

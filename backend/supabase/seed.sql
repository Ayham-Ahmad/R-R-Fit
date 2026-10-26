-- R&R Fit - clean production seed
-- Creates only the platform settings row and the fixed exercise categories.
-- No demo users, exercises, schedules, or leaderboard weeks are inserted.
begin;

insert into public.platform_settings (
  id, website_name_en, website_name_ar,
  coach_name_en, coach_name_ar, coach_email, coach_phone, whatsapp_phone,
  leaderboard_enabled, leaderboard_published, strict_verification,
  leaderboard_stage, reward_title_en, reward_title_ar
)
values (
  1, 'R&R Fit', 'رانا رويال فتنيس',
  '', '', '', '', '',
  true, true, true, 'published',
  'One Extra Free Fitness Class', 'حصة تدريبية مجانية إضافية واحدة'
)
on conflict (id) do update
set website_name_en = excluded.website_name_en,
    website_name_ar = excluded.website_name_ar;

insert into public.categories (id, name_en, name_ar, sort_order)
values
  ('legs', 'Legs', 'الأرجل', 10),
  ('glutes', 'Glutes', 'الأرداف', 20),
  ('abs', 'Abs', 'البطن', 30),
  ('back', 'Back', 'الظهر', 40),
  ('chest', 'Chest', 'الصدر', 50),
  ('shoulders', 'Shoulders', 'الأكتاف', 60),
  ('arms', 'Arms', 'الذراعين', 70),
  ('cardio', 'Cardio', 'كارديو', 80),
  ('fullbody', 'Full Body', 'كامل الجسم', 90)
on conflict (id) do update
set name_en = excluded.name_en,
    name_ar = excluded.name_ar,
    sort_order = excluded.sort_order;

commit;

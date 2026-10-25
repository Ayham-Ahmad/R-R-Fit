-- NoorFit Studio - initial categories, stickman exercises, settings, and live week
begin;

insert into public.platform_settings (
  id, website_name_en, website_name_ar, coach_name_en, coach_name_ar,
  coach_email, coach_phone, whatsapp_phone,
  leaderboard_enabled, leaderboard_published, strict_verification,
  leaderboard_stage, reward_title_en, reward_title_ar
)
values (
  1, 'NoorFit Studio', 'نور فيت ستوديو',
  'Coach Layla Al-Harbi', 'المدربة ليلى الحربي',
  'coach@noorfit.sa', '+966 50 123 4567', '966501234567',
  true, true, true, 'published',
  'One Extra Free Fitness Class', 'حصة تدريبية مجانية إضافية واحدة'
)
on conflict (id) do update
set website_name_en = excluded.website_name_en,
    website_name_ar = excluded.website_name_ar,
    coach_name_en = excluded.coach_name_en,
    coach_name_ar = excluded.coach_name_ar,
    reward_title_en = excluded.reward_title_en,
    reward_title_ar = excluded.reward_title_ar;

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

insert into public.exercises (
  id, category_id, name_en, name_ar, desc_en, desc_ar,
  default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key
)
values
  (
    '00000000-0000-0000-0000-000000000001', 'legs',
    'Goblet Squat', 'سكوات الكأس بالدمبل',
    'Controlled lower-body squat holding a dumbbell at chest height to strengthen quads and glutes.',
    'تمرين قرفصاء متوازن مع حمل الدمبل أمام الصدر لتقوية عضلات الفخذين والأرداف.',
    4, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'squat'
  ),
  (
    '00000000-0000-0000-0000-000000000002', 'glutes',
    'Barbell Hip Thrust', 'دفع الحوض للأعلى بالبار',
    'Targeted glute bridge movement with upper back supported on a bench for maximum glute activation.',
    'تمرين رفع الحوض مع تثبيت أعلى الظهر على المقعد لاستهداف عضلات الأرداف بفعالية عالية.',
    4, '10 reps', '١٠ تكرارات', '90 sec', '٩٠ ثانية', 'hipthrust'
  ),
  (
    '00000000-0000-0000-0000-000000000003', 'abs',
    'Core Plank Hold', 'ثبات البلانك لعضلات البطن',
    'Isometric abdominal stabilization keeping spine neutral and core braced.',
    'تمرين ثبات لتقوية عضلات البطن العميقة واستقرار الجذع والعمود الفقري.',
    3, '45 sec', '٤٥ ثانية', '45 sec', '٤٥ ثانية', 'plank'
  ),
  (
    '00000000-0000-0000-0000-000000000004', 'back',
    'Seated Lat Pulldown', 'سحب الكابل العلوي للظهر',
    'Upper-back pulling exercise focusing on shoulder blade retraction and posture support.',
    'تمرين سحب علوي لتقوية عضلات الظهر العلوية وتحسين استقامة القوام.',
    3, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'latpulldown'
  ),
  (
    '00000000-0000-0000-0000-000000000005', 'shoulders',
    'Seated Dumbbell Shoulder Press', 'ضغط الأكتاف بالدمبل جلوساً',
    'Overhead dumbbell press to sculpt and strengthen the anterior and lateral deltoids.',
    'رفع الدمبل لأعلى الرأس لتقوية وشد عضلات الأكتاف الأمامية والجانبية.',
    3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress'
  ),
  (
    '00000000-0000-0000-0000-000000000006', 'cardio',
    'Low-Impact Step Intervals', 'تمارين الخطوات الهوائية المعتدلة',
    'Rhythmic cardio intervals designed to elevate heart rate without harsh joint impact.',
    'تمارين هوائية متناغمة لرفع معدل نبضات القلب وحرق السعرات دون إجهاد المفاصل.',
    3, '5 min', '٥ دقائق', '60 sec', '٦٠ ثانية', 'cardio'
  )
on conflict (id) do update
set category_id = excluded.category_id,
    name_en = excluded.name_en,
    name_ar = excluded.name_ar,
    desc_en = excluded.desc_en,
    desc_ar = excluded.desc_ar,
    default_sets = excluded.default_sets,
    reps_en = excluded.reps_en,
    reps_ar = excluded.reps_ar,
    rest_en = excluded.rest_en,
    rest_ar = excluded.rest_ar,
    preset_key = excluded.preset_key,
    is_active = true;

do $$
declare
  v_start date := date_trunc('week', current_date)::date;
  v_end date := v_start + 6;
begin
  if not exists (select 1 from public.leaderboard_weeks where is_live = true) then
    insert into public.leaderboard_weeks (
      label_en, label_ar, short_en, short_ar, starts_on, ends_on, is_live, is_published
    )
    values (
      to_char(v_start, 'FMMonth DD') || ' – ' || to_char(v_end, 'FMMonth DD') || ' (Current Week)',
      to_char(v_start, 'FMMonth DD') || ' – ' || to_char(v_end, 'FMMonth DD') || ' (الأسبوع الحالي)',
      to_char(v_start, 'Mon DD') || ' – ' || to_char(v_end, 'Mon DD'),
      to_char(v_start, 'Mon DD') || ' – ' || to_char(v_end, 'Mon DD'),
      v_start, v_end, true, true
    );
  end if;
end;
$$;

commit;

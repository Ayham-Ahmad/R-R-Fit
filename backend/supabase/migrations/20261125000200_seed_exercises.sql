-- Seed the exercise library from the tracked JSON export.
-- Insert-only: custom edits to existing exercises are never overwritten.

begin;

-- Categories are also seeded here so this migration is valid on its own.
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
on conflict (id) do nothing;

-- Exercises
insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Bodyweight Air Squat', 'سكوات بوزن الجسم', 'Controlled foundational squat keeping heels flat and chest lifted to tone quads and glutes.', 'تمرين القرفصاء الأساسي بوزن الجسم مع تثبيت الكعبين واستقامة الصدر لشد الفخذين والأرداف.', 4, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex0.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Bodyweight Air Squat')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Pulse Squat', 'سكوات النبض السفلي', 'Stay in the bottom half of the squat and perform small controlled pulses for intense quad burn.', 'البقاء في أسفل وضعية السكوات وأداء نبضات قصيرة متتالية لزيادة شد عضلات الفخذين.', 3, '20 pulses', '٢٠ نبضة', '60 sec', '٦٠ ثانية', 'squat', 'exercises/ex_ex1.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Pulse Squat')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Wide Sumo Squat', 'سكوات السومو الواسع', 'Wide stance with toes turned out 45 degrees targeting inner thighs and glutes.', 'قرفصاء بوقفة واسعة وتوجيه أصابع القدم للخارج لاستهداف الفخذين الداخليين والأرداف.', 4, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex2.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Wide Sumo Squat')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Sumo Squat Calf Raise', 'سكوات السومو مع رفع الكعبين', 'Hold a deep sumo squat and lift heels off the floor to sculpt calves and inner thighs.', 'الثبات في وضعية السومو سكوات مع رفع الكعبين عن الأرض لشد السمانة والفخذ الداخلي.', 3, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex3.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Sumo Squat Calf Raise')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Reverse Bodyweight Lunge', 'طعن خلفي بوزن الجسم', 'Step backward and lower back knee toward the mat for knee-friendly quad and glute shaping.', 'خطوة للخلف مع خفض الركبة الخلفية باتجاه البساط لتقوية الأرجل والأرداف بأمان للركبتين.', 3, '12 reps / leg', '١٢ تكرار لكل رجل', '60 sec', '٦٠ ثانية', 'squat', 'exercises/ex_ex4.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Reverse Bodyweight Lunge')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Forward Alternating Lunge', 'طعن أمامي بالتبادل', 'Step forward alternating legs while keeping torso upright and core braced.', 'خطوة للأمام بالتبادل بين الرجلين مع الحفاظ على استقامة الجذع وشد البطن.', 3, '12 reps / leg', '١٢ تكرار لكل رجل', '60 sec', '٦٠ ثانية', 'squat', 'exercises/ex_ex5.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Forward Alternating Lunge')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Split Squat Isometric Hold', 'ثبات الطعن السفلي', 'Hold the bottom of a split lunge to build lower-body endurance and knee stability.', 'الثبات في أسفل وضعية الطعن لتقوية تحمل عضلات الأرجل واستقرار الركبة.', 3, '30 sec / leg', '٣٠ ثانية لكل رجل', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex6.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Split Squat Isometric Hold')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'legs', 'Tempo Slow Squat', 'سكوات بطيء بالتحكم', 'Lower down over 3 full seconds, pause 1 second at the bottom, and rise smoothly.', 'النزول ببطء خلال ٣ ثوانٍ مع التوقف لثانية في الأسفل ثم الصعود بهدوء.', 3, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'squat', 'exercises/ex_ex7.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Tempo Slow Squat')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Floor Glute Bridge', 'جسر الأرداف الأرضي', 'Lie on your back, drive through heels, and squeeze glutes at the top without arching lower back.', 'الاستلقاء على الظهر ودفع الأرض بالكعبين مع شد الأرداف في الأعلى دون تقوس أسفل الظهر.', 4, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'hipthrust', 'exercises/ex_ex8.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Floor Glute Bridge')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Single-Leg Glute Bridge', 'جسر الأرداف برجل واحدة', 'Perform the floor bridge with one leg extended to isolate each glute independently.', 'أداء جسر الأرداف مع مد رجل واحدة للأمام لعزل وتقوية كل جهة من الأرداف.', 3, '10 reps / side', '١٠ تكرارات لكل جهة', '60 sec', '٦٠ ثانية', 'hipthrust', 'exercises/ex_ex9.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Single-Leg Glute Bridge')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Glute Bridge Top Hold & Pulse', 'ثبات ونبض جسر الأرداف', 'Hold the top of your glute bridge and perform mini upward squeezes.', 'الثبات في أعلى وضعية الجسر مع أداء نبضات علوية قصيرة لشد الأرداف.', 3, '20 pulses', '٢٠ نبضة', '45 sec', '٤٥ ثانية', 'hipthrust', 'exercises/ex_ex10.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Glute Bridge Top Hold & Pulse')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Frog Pump Glute Bridge', 'جسر الضفدع للأرداف', 'Press soles of feet together with knees wide and bridge hips up for intense glute activation.', 'ضم باطن القدمين معاً وفتح الركبتين للخارج ثم رفع الحوض للأعلى لاستهداف الأرداف بعمق.', 3, '20 reps', '٢٠ تكرار', '45 sec', '٤٥ ثانية', 'hipthrust', 'exercises/ex_ex11.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Frog Pump Glute Bridge')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Quadruped Donkey Kick', 'ركلة الدونكي للأرداف', 'On hands and knees, kick one heel toward the ceiling while keeping core tight.', 'على اليدين والركبتين، ادفعي كعب القدم للأعلى باتجاه السقف مع تثبيت الجذع.', 4, '15 reps / side', '١٥ تكرار لكل جهة', '45 sec', '٤٥ ثانية', 'hipthrust', 'exercises/ex_ex12.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Quadruped Donkey Kick')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Quadruped Fire Hydrant', 'فتح الحوض الجانبي على الأربع', 'From all fours, lift bent knee out to the side to sculpt the upper and outer glutes.', 'من وضعية الارتكاز على الأربع، ارفعي الركبة المثنية للجانب لنحت العضلة الجانبية للأرداف.', 3, '15 reps / side', '١٥ تكرار لكل جهة', '45 sec', '٤٥ ثانية', 'hipthrust', 'exercises/ex_ex13.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Quadruped Fire Hydrant')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Side-Lying Leg Abduction', 'رفع الساق الجانبي للأرداف', 'Lie on your side propped on forearm and lift top leg smoothly to target glute medius.', 'الاستلقاء على الجانب مع رفع الساق العلوية بتحكم لاستهداف الخفسة والأرداف الجانبية.', 4, '15 reps / side', '١٥ تكرار لكل جهة', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex14.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Side-Lying Leg Abduction')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'glutes', 'Side-Lying Clamshell', 'تمرين الصدفة الجانبي', 'Keep feet touching and open top knee like a clamshell to strengthen hip stabilizers.', 'الاستلقاء جانباً مع ضم القدمين وفتح الركبة العلوية لتقوية عضلات الحوض والأرداف.', 3, '15 reps / side', '١٥ تكرار لكل جهة', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex15.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Side-Lying Clamshell')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Forearm Core Plank', 'ثبات البلانك على الساعدين', 'Hold a straight line from shoulders to ankles while bracing deep abdominal muscles.', 'الثبات باستقامة كاملة من الكتفين حتى الكاحلين مع شد عضلات البطن العميقة.', 3, '45 sec', '٤٥ ثانية', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex16.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Forearm Core Plank')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Alternating Bicycle Crunch', 'تمرين الدراجة لعضلات البطن', 'Rotate opposite elbow to opposite knee while extending the other leg to target obliques.', 'لمس المرفق للركبة المعاكسة بالتبادل لشد عضلات البطن الأمامية والجانبية (الخواصر).', 4, '20 reps', '٢٠ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex17.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Alternating Bicycle Crunch')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Lying Lower-Ab Leg Raise', 'رفع الأرجل لأسفل البطن', 'Press lower back flat into the mat and raise straight legs up and down with control.', 'تثبيت أسفل الظهر على البساط ورفع الساقين الممدودتين للأعلى والأسفل ببطء وتحكم.', 3, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'plank', 'exercises/ex_ex18.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Lying Lower-Ab Leg Raise')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Supine Flutter Kicks', 'رفرفة الساقين لأسفل البطن', 'Hover legs slightly above the mat and perform quick alternating up-and-down kicks.', 'رفع الساقين قليلاً عن الأرض وأداء حركات تبادلية سريعة لشد أسفل البطن.', 3, '30 sec', '٣٠ ثانية', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex19.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Supine Flutter Kicks')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Dead Bug Core Stabilizer', 'تمرين الحشرة الميتة لثبات الجذع', 'Lie on your back and lower opposite arm and leg toward the floor without arching your back.', 'الاستلقاء على الظهر ومد الذراع والرجل المعاكسة نحو الأرض مع إبقاء الظهر ملاصقاً للبساط.', 3, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex20.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Dead Bug Core Stabilizer')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Seated Russian Twist', 'التفاف الجذع الروسي للخواصر', 'Balance on sit bones and rotate torso side to side to cinch the waistline.', 'الجلوس مع ميل خفيف للخلف وتدوير الجذع يميناً ويساراً لنحت الخصر.', 3, '20 twists', '٢٠ التفة', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex21.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Seated Russian Twist')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Reverse Crunch', 'الطحن العكسي لأسفل البطن', 'Curl knees toward chest lifting hips slightly off the mat using lower abdominal control.', 'سحب الركبتين باتجاه الصدر مع رفع الحوض قليلاً عن البساط باستخدام عضلات البطن السفلية.', 3, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex22.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Reverse Crunch')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'abs', 'Side Plank Hip Hold', 'ثبات البلانك الجانبي للخصر', 'Prop on one forearm and hold hips lifted to tone obliques and lateral core.', 'الارتكاز على ساعد واحد ورفع الخصر عن الأرض لشد عضلات الجوانب.', 3, '30 sec / side', '٣٠ ثانية لكل جهة', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex23.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Side Plank Hip Hold')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'back', 'Prone Superman Extension', 'تمرين سوبرمان لأسفل الظهر', 'Lie face down and lift arms, chest, and legs together to strengthen the entire back chain.', 'الاستلقاء على البطن ورفع الذراعين والصدر والساقين معاً لتقوية عضلات الظهر بالكامل.', 3, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex24.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Prone Superman Extension')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'back', 'Prone Swimmer Flutter', 'تمرين السباح لعضلات الظهر', 'Hover chest off the mat and alternate lifting opposite arm and leg like a swimmer.', 'رفع الصدر قليلاً عن البساط وتحريك الذراعين والساقين بالتبادل مثل حركة السباحة.', 3, '30 sec', '٣٠ ثانية', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex25.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Prone Swimmer Flutter')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'back', 'Prone W-to-Y Back Pull', 'سحب الذراعين الأرضي لشد الظهر', 'Lift chest on the mat and pull elbows back into a W shape, squeezing shoulder blades.', 'رفع الصدر عن الأرض وسحب المرفقين للخلف على شكل حرف W لتقريب لوحي الكتف وشد الظهر.', 4, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex26.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Prone W-to-Y Back Pull')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'back', 'Quadruped Bird-Dog', 'تمرين الطائر والكلب لتوازن الظهر', 'Extend opposite arm and leg straight out from all fours, keeping hips level.', 'مد الذراع والرجل المعاكسة باستقامة من وضعية الأربع مع الحفاظ على توازن الحوض والظهر.', 3, '10 reps / side', '١٠ تكرارات لكل جهة', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex27.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Quadruped Bird-Dog')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'back', 'Reverse Snow Angel', 'ملاك الثلج العكسي لأعلى الظهر', 'Lie face down and sweep straight arms from hips to overhead while squeezing upper back.', 'الاستلقاء على البطن وتحريك الذراعين الممدودتين من الجوانب للأمام مع شد أعلى الظهر.', 3, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex28.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Reverse Snow Angel')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'chest', 'Standard Floor Push-Up', 'تمرين الضغط الكامل للصدر', 'Lower chest toward the mat keeping body in a firm plank line, then press back up.', 'خفض الصدر باتجاه البساط مع استقامة الجسم بالكامل ثم الدفع للأعلى.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex29.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Standard Floor Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'chest', 'Modified Knee Push-Up', 'تمرين الضغط على الركبتين', 'Perform controlled push-ups with knees resting on the mat for accessible upper-body toning.', 'أداء تمرين الضغط مع ارتكاز الركبتين على البساط لتقوية الصدر والذراعين بتحكم.', 4, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex30.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Modified Knee Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'chest', 'Wide-Grip Chest Push-Up', 'ضغط الصدر بيدين واسعتين', 'Place hands wider than shoulder-width to emphasize chest sculpting.', 'وضع اليدين بمسافة أوسع من الكتفين لزيادة التركيز على عضلات الصدر.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex31.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Wide-Grip Chest Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'chest', 'Hand-Release Push-Up', 'تمرين الضغط مع رفع اليدين في الأسفل', 'Lower all the way to the mat, briefly lift hands an inch, and press cleanly back up.', 'النزول الكامل للبساط ورفع الكفين للحظة قصيرة ثم الدفع القوي للأعلى.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex32.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Hand-Release Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'shoulders', 'Pike Shoulder Push-Up', 'ضغط البايك لتقوية الأكتاف', 'Lift hips into an inverted V position and lower crown of head toward the floor.', 'رفع الحوض للأعلى على شكل حرف V مقلوب وخفض الرأس باتجاه الأرض لتقوية الأكتاف.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex33.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Pike Shoulder Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'shoulders', 'High Plank Shoulder Tap', 'لمس الكتفين في وضعية البلانك', 'In a high plank, tap opposite shoulder with each hand while preventing hip sway.', 'في وضعية البلانك العالي، المس الكتف المعاكس بكل يد بالتبادل مع منع تمايل الحوض.', 3, '20 taps', '٢٠ لمسة', '45 sec', '٤٥ ثانية', 'shoulderpress', 'exercises/ex_ex34.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('High Plank Shoulder Tap')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'shoulders', 'Standing Arm Circles', 'دوائر الذراعين الجانبية للأكتاف', 'Extend arms straight out at shoulder height and trace tight controlled circles.', 'مد الذراعين جانباً بمستوى الكتفين ورسم دوائر صغيرة ومتواصلة لشد الأكتاف.', 3, '45 sec', '٤٥ ثانية', '30 sec', '٣٠ ثانية', 'cardio', 'exercises/ex_ex35.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Standing Arm Circles')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'shoulders', 'Downward-Dog to Plank Flow', 'التنقل بين البلانك ووضعية المثلث', 'Push hips back into an inverted V stretch, then glide smoothly back to high plank.', 'دفع الحوض للأعلى والخلف لشد الأكتاف ثم العودة بانسيابية لوضعية البلانك.', 3, '12 reps', '١٢ تكرار', '45 sec', '٤٥ ثانية', 'shoulderpress', 'exercises/ex_ex36.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Downward-Dog to Plank Flow')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'arms', 'Chair / Edge Tricep Dip', 'غطس الترايسبس على حافة مقعد', 'Support hands on a low step or couch edge and bend elbows to tone the back of the arms.', 'الارتكاز باليدين على حافة مقعد منخفض وثني المرفقين لشد خلفية الذراعين (الترايسبس).', 4, '12 reps', '١٢ تكرار', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex37.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Chair / Edge Tricep Dip')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'arms', 'Diamond Close-Hand Push-Up', 'تمرين الضغط الضيق للذراعين', 'Place hands close together under chest to target triceps and inner chest.', 'تقريب اليدين تحت الصدر على شكل ماسة لاستهداف عضلات الذراعين الخلفية بفاعلية.', 3, '8 reps', '٨ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex38.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Diamond Close-Hand Push-Up')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'arms', 'Plank Up-Downs (Commandos)', 'بلانك الصعود والنزول للذراعين', 'Transition from forearm plank up to high hand plank and back down one arm at a time.', 'الانتقال من بلانك الساعدين إلى بلانك الكفين والعودة بالتبادل لتقوية الذراعين والجذع.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'plank', 'exercises/ex_ex39.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Plank Up-Downs (Commandos)')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'arms', 'Floor Crab Tricep Press', 'ضغط الترايسبس الأرضي العكسي', 'Sit with hands behind hips, lift hips slightly, and bend elbows straight back.', 'الجلوس مع وضع الكفين خلف الحوض ورفع الجسم قليلاً ثم ثني المرفقين للخلف.', 3, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'shoulderpress', 'exercises/ex_ex40.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Floor Crab Tricep Press')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'cardio', 'Classic Jumping Jacks', 'قفز فتح وضم الذراعين والرجلين', 'Full-body rhythmic jumping jacks to elevate heart rate and burn calories.', 'قفزات متناغمة بفتح وضم الذراعين والساقين لرفع نبضات القلب وحرق السعرات.', 3, '45 sec', '٤٥ ثانية', '30 sec', '٣٠ ثانية', 'cardio', 'exercises/ex_ex41.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Classic Jumping Jacks')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'cardio', 'Low-Impact Step Jacks', 'خطوات الجاك الهوائية بدون قفز', 'Step one foot out to the side at a time while sweeping arms overhead—apartment friendly.', 'خطوة جانبية بالتبادل مع رفع الذراعين للأعلى دون قفز لحماية المفاصل.', 3, '60 sec', '٦٠ ثانية', '30 sec', '٣٠ ثانية', 'cardio', 'exercises/ex_ex42.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Low-Impact Step Jacks')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'cardio', 'High Knees Cardio Run', 'الجري في المكان برفع الركبتين', 'Drive knees up toward hip level with an energetic arm pump.', 'الجري السريع في المكان مع رفع الركبتين لمستوى الحوض وتحريك الذراعين بحيوية.', 4, '30 sec', '٣٠ ثانية', '30 sec', '٣٠ ثانية', 'cardio', 'exercises/ex_ex43.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('High Knees Cardio Run')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'cardio', 'Fast Mountain Climbers', 'متسلق الجبال لحرق الدهون', 'Hold a strong high plank and drive knees rapidly toward your chest.', 'من وضعية البلانك العالي، اسحبي الركبتين بالتبادل وبسرعة باتجاه الصدر.', 3, '30 sec', '٣٠ ثانية', '45 sec', '٤٥ ثانية', 'shoulderpress', 'exercises/ex_ex44.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Fast Mountain Climbers')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'cardio', 'Lateral Skater Hops', 'القفز الجانبي الرشيق', 'Bound lightly from side to side landing softly on one foot to boost agility.', 'التنقل الجانبي الرشيق من جهة لأخرى مع هبوط ناعم لرفع اللياقة والرشاقة.', 3, '40 sec', '٤٠ ثانية', '40 sec', '٤٠ ثانية', 'cardio', 'exercises/ex_ex45.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Lateral Skater Hops')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'fullbody', 'Low-Impact Walkout Burpee', 'بيربي المشي المتدرج لكامل الجسم', 'Squat down, walk hands out to a plank, walk feet back in, and stand tall.', 'النزول قرفصاء والمشي باليدين لوضعية البلانك ثم العودة والوقوف الكامل دون قفز عنيف.', 3, '10 reps', '١٠ تكرارات', '60 sec', '٦٠ ثانية', 'squat', 'exercises/ex_ex46.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Low-Impact Walkout Burpee')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'fullbody', 'Inchworm Plank Walkout', 'تمرين الدودة لمرونة وقوة الجسم', 'Hinge at hips, walk hands out to a full plank, perform one push-up, and walk hands back.', 'الانحناء للأمام والمشي باليدين حتى وضعية البلانك الكامل ثم العودة للوقوف.', 3, '8 reps', '٨ تكرارات', '60 sec', '٦٠ ثانية', 'shoulderpress', 'exercises/ex_ex47.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Inchworm Plank Walkout')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'fullbody', 'Squat to Overhead Reach', 'سكوات مع التمدد العلوي الكامل', 'Perform a deep squat and reach arms high overhead as you stand to engage the whole body.', 'أداء قرفصاء عميقة ثم الوقوف مع مد الذراعين عالياً لتنشيط كامل عضلات الجسم.', 3, '15 reps', '١٥ تكرار', '45 sec', '٤٥ ثانية', 'squat', 'exercises/ex_ex48.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Squat to Overhead Reach')
);

insert into public.exercises (category_id, name_en, name_ar, desc_en, desc_ar, default_sets, reps_en, reps_ar, rest_en, rest_ar, preset_key, media_path, is_active)
select 'fullbody', 'Bear Crawl Hold & Step', 'مشية الدب لتقوية كامل الجسم', 'Hover knees an inch off the mat on all fours and take small controlled steps.', 'الارتكاز على اليدين وأصابع القدمين مع رفع الركبتين قليلاً عن البساط والتحرك بتحكم.', 3, '30 sec', '٣٠ ثانية', '45 sec', '٤٥ ثانية', 'plank', 'exercises/ex_ex49.svg', true
where not exists (
  select 1 from public.exercises e where lower(e.name_en) = lower('Bear Crawl Hold & Step')
);

commit;

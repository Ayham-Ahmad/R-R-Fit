-- Remove exposed [ANIMATION_CODE] blocks from exercise descriptions
UPDATE public.exercises
SET desc_ar = btrim(regexp_replace(desc_ar, '\s*\[ANIMATION_CODE\][\s\S]*$', ''))
WHERE desc_ar LIKE '%[ANIMATION_CODE]%';

-- Just in case any English descriptions were affected
UPDATE public.exercises
SET desc_en = btrim(regexp_replace(desc_en, '\s*\[ANIMATION_CODE\][\s\S]*$', ''))
WHERE desc_en LIKE '%[ANIMATION_CODE]%';

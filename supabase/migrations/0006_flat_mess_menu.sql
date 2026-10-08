-- ═════════════════════════════════════════════════════════════════════════════
-- 0006_flat_mess_menu.sql
-- Flat Excel Mess Menu Architecture & Storage Migration
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Table: mess_weeks
CREATE TABLE IF NOT EXISTS public.mess_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key TEXT NOT NULL UNIQUE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  title TEXT NOT NULL,
  source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_mess_weeks_dates CHECK (week_end >= week_start AND (week_end - week_start) <= 7)
);

-- 2. Table: mess_menu_items
CREATE TABLE IF NOT EXISTS public.mess_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES public.mess_weeks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'hi_tea', 'dinner')),
  position INTEGER NOT NULL CHECK (position >= 1),
  item_raw TEXT NOT NULL,
  item_display TEXT NOT NULL,
  category TEXT,
  diet TEXT NOT NULL DEFAULT 'veg' CHECK (diet IN ('veg', 'egg', 'non_veg')),
  is_special BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mess_menu_items_date_meal_pos UNIQUE (date, meal, position)
);

CREATE INDEX IF NOT EXISTS idx_mess_menu_items_date_meal ON public.mess_menu_items(date, meal);
CREATE INDEX IF NOT EXISTS idx_mess_menu_items_week_id ON public.mess_menu_items(week_id);

-- Trigger: Ensure item date falls within the week's start and end date
CREATE OR REPLACE FUNCTION public.check_mess_item_date_in_week()
RETURNS TRIGGER AS $$
DECLARE
  w_start DATE;
  w_end DATE;
BEGIN
  SELECT week_start, week_end INTO w_start, w_end FROM public.mess_weeks WHERE id = NEW.week_id;
  IF NEW.date < w_start OR NEW.date > w_end THEN
    RAISE EXCEPTION 'Item date % is outside the week range (% to %)', NEW.date, w_start, w_end;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_mess_item_date ON public.mess_menu_items;
CREATE TRIGGER trg_check_mess_item_date
  BEFORE INSERT OR UPDATE ON public.mess_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.check_mess_item_date_in_week();

-- 3. Table: mess_meal_timings
CREATE TABLE IF NOT EXISTS public.mess_meal_timings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'hi_tea', 'dinner')),
  label TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'weekday', 'weekend')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  effective_from DATE NOT NULL DEFAULT '2026-01-01',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mess_timings_meal_applies_eff UNIQUE (meal, applies_to, effective_from),
  CONSTRAINT chk_mess_timings_time CHECK (end_time > start_time)
);

-- Seed Default Meal Timings
INSERT INTO public.mess_meal_timings (meal, label, applies_to, start_time, end_time, effective_from)
VALUES
  ('breakfast', 'Breakfast', 'all', '07:30:00', '09:30:00', '2026-01-01'),
  ('lunch',     'Lunch',     'all', '12:00:00', '14:30:00', '2026-01-01'),
  ('hi_tea',    'Hi-Tea',    'all', '16:30:00', '18:00:00', '2026-01-01'),
  ('dinner',    'Dinner',    'all', '19:30:00', '21:30:00', '2026-01-01')
ON CONFLICT (meal, applies_to, effective_from) DO NOTHING;

-- 4. View: mess_menu_day
CREATE OR REPLACE VIEW public.mess_menu_day AS
WITH resolved_timings AS (
  SELECT DISTINCT ON (m.meal, d.date_val)
    d.date_val AS date,
    m.meal,
    t.label,
    t.start_time,
    t.end_time
  FROM (SELECT DISTINCT date AS date_val FROM public.mess_menu_items) d
  CROSS JOIN (VALUES ('breakfast'), ('lunch'), ('hi_tea'), ('dinner')) AS m(meal)
  LEFT JOIN public.mess_meal_timings t
    ON t.meal = m.meal
   AND t.effective_from <= d.date_val
   AND (
     t.applies_to = 'all'
     OR (t.applies_to = 'weekday' AND EXTRACT(ISODOW FROM d.date_val) BETWEEN 1 AND 5)
     OR (t.applies_to = 'weekend' AND EXTRACT(ISODOW FROM d.date_val) IN (6, 7))
   )
  ORDER BY m.meal, d.date_val, t.effective_from DESC, (CASE WHEN t.applies_to = 'all' THEN 1 ELSE 0 END)
),
aggregated_items AS (
  SELECT
    i.date,
    i.meal,
    jsonb_agg(
      jsonb_build_object(
        'position', i.position,
        'name', i.item_display,
        'raw', i.item_raw,
        'category', i.category,
        'diet', i.diet,
        'is_special', i.is_special,
        'note', i.note
      ) ORDER BY i.position ASC
    ) AS items,
    bool_or(i.diet IN ('non_veg', 'egg')) AS has_non_veg,
    bool_or(i.is_special) AS has_special
  FROM public.mess_menu_items i
  GROUP BY i.date, i.meal
)
SELECT
  rt.date,
  rt.meal,
  COALESCE(rt.label, initcap(rt.meal)) AS label,
  COALESCE(rt.start_time, '08:00:00'::TIME) AS start_time,
  COALESCE(rt.end_time, '10:00:00'::TIME) AS end_time,
  COALESCE(ai.items, '[]'::jsonb) AS items,
  COALESCE(ai.has_non_veg, false) AS has_non_veg,
  COALESCE(ai.has_special, false) AS has_special
FROM resolved_timings rt
LEFT JOIN aggregated_items ai ON rt.date = ai.date AND rt.meal = ai.meal;

-- 5. Data Migration from legacy mess_menu (if present)
DO $$
DECLARE
  old_row RECORD;
  w_id UUID;
  item_text TEXT;
  pos INT;
  guessed_diet TEXT;
  w_start DATE;
  w_end DATE;
  w_key TEXT;
  normalized_meal TEXT;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mess_menu') THEN
    FOR old_row IN SELECT * FROM public.mess_menu ORDER BY date, start_time LOOP
      normalized_meal := CASE WHEN old_row.meal = 'snacks' THEN 'hi_tea' ELSE old_row.meal END;
      w_start := date_trunc('week', old_row.date)::DATE;
      w_end := (w_start + INTERVAL '6 days')::DATE;
      w_key := 'week_' || to_char(w_start, 'YYYY_MM_DD');

      INSERT INTO public.mess_weeks (week_key, week_start, week_end, title)
      VALUES (w_key, w_start, w_end, 'Week of ' || to_char(w_start, 'Mon DD, YYYY'))
      ON CONFLICT (week_key) DO NOTHING;

      SELECT id INTO w_id FROM public.mess_weeks WHERE week_key = w_key;

      pos := 1;
      IF old_row.items IS NOT NULL THEN
        FOREACH item_text IN ARRAY old_row.items LOOP
          item_text := trim(item_text);
          IF item_text <> '' THEN
            guessed_diet := CASE 
              WHEN item_text ~* '(chicken|mutton|fish|prawn|egg|omelette|bhurji)' THEN 
                (CASE WHEN item_text ~* '(egg|omelette|bhurji)' THEN 'egg' ELSE 'non_veg' END)
              ELSE 'veg'
            END;

            INSERT INTO public.mess_menu_items (
              week_id, date, meal, position, item_raw, item_display, diet, is_special
            ) VALUES (
              w_id, old_row.date, normalized_meal, pos, item_text, item_text, guessed_diet, false
            ) ON CONFLICT (date, meal, position) DO NOTHING;

            pos := pos + 1;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.mess_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_meal_timings ENABLE ROW LEVEL SECURITY;

-- Campus-wide read policies for all authenticated users (no cohort restriction)
CREATE POLICY "Allow authenticated read mess_weeks"
  ON public.mess_weeks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read mess_menu_items"
  ON public.mess_menu_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read mess_meal_timings"
  ON public.mess_meal_timings FOR SELECT TO authenticated USING (true);

-- Admin-only write policies
CREATE POLICY "Allow admin write mess_weeks"
  ON public.mess_weeks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Allow admin write mess_menu_items"
  ON public.mess_menu_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Allow admin write mess_meal_timings"
  ON public.mess_meal_timings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

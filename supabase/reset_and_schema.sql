-- Exam Master Nigeria — Complete Database Reset & RLS Schema (PostgreSQL / Supabase)
-- Drops all existing tables, policies, and functions, then recreates a clean relational schema.

-- 1. DROP EXISTING OBJECTS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.scholarships CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;
DROP TABLE IF EXISTS public.news_posts CASCADE;
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.attempts CASCADE;
DROP TABLE IF EXISTS public.options CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 2. CREATE TABLES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  class_level TEXT DEFAULT 'UTME Candidate',
  target_exam TEXT DEFAULT 'JAMB',
  target_school TEXT DEFAULT 'University of Lagos (UNILAG)',
  state TEXT DEFAULT 'Lagos',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  exam_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  icon TEXT NOT NULL DEFAULT 'BookOpen',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.exams (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_score INTEGER NOT NULL DEFAULT 100,
  default_duration_mins INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE public.topics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  exam_code TEXT NOT NULL DEFAULT 'JAMB'
);

CREATE TABLE public.questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  exam_code TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT 'General',
  year INTEGER NOT NULL,
  passage TEXT,
  prompt TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('A', 'B', 'C', 'D')),
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.attempts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_code TEXT NOT NULL,
  subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL,
  time_limit_seconds INTEGER NOT NULL
);

CREATE TABLE public.results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_code TEXT NOT NULL,
  raw_correct INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  jamb_score INTEGER NOT NULL,
  subject_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.news_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  author TEXT NOT NULL,
  published_at TEXT NOT NULL,
  read_time_mins INTEGER NOT NULL DEFAULT 3,
  image_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE public.schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  acronym TEXT NOT NULL,
  type TEXT NOT NULL,
  ownership TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  utme_cut_off INTEGER NOT NULL,
  tuition_range TEXT NOT NULL,
  courses JSONB NOT NULL DEFAULT '[]'::jsonb,
  website TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL
);

CREATE TABLE public.scholarships (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  amount TEXT NOT NULL,
  deadline TEXT NOT NULL,
  eligibility TEXT NOT NULL,
  level TEXT NOT NULL,
  link TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'annual')),
  amount_naira INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.chat_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_id TEXT,
  subject_name TEXT NOT NULL DEFAULT 'General Studies',
  exam_level TEXT NOT NULL DEFAULT 'JAMB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone, class_level, target_exam, state, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'class_level', 'UTME Candidate'),
    COALESCE(NEW.raw_user_meta_data->>'target_exam', 'JAMB'),
    COALESCE(NEW.raw_user_meta_data->>'state', 'Lagos'),
    COALESCE(NEW.email_confirmed_at IS NOT NULL, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. ENABLE ROW LEVEL SECURITY ON EVERY TABLE
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES
-- Profiles: Users read/write own; admins can read all
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- Public Read / Admin Write tables
CREATE POLICY "subjects_public_read" ON public.subjects FOR SELECT USING (TRUE);
CREATE POLICY "subjects_admin_write" ON public.subjects FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "exams_public_read" ON public.exams FOR SELECT USING (TRUE);
CREATE POLICY "exams_admin_write" ON public.exams FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "topics_public_read" ON public.topics FOR SELECT USING (TRUE);
CREATE POLICY "topics_admin_write" ON public.topics FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "questions_public_read" ON public.questions FOR SELECT USING (TRUE);
CREATE POLICY "questions_admin_write" ON public.questions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "options_public_read" ON public.options FOR SELECT USING (TRUE);
CREATE POLICY "options_admin_write" ON public.options FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "news_public_read" ON public.news_posts FOR SELECT USING (TRUE);
CREATE POLICY "news_admin_write" ON public.news_posts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "schools_public_read" ON public.schools FOR SELECT USING (TRUE);
CREATE POLICY "schools_admin_write" ON public.schools FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "scholarships_public_read" ON public.scholarships FOR SELECT USING (TRUE);
CREATE POLICY "scholarships_admin_write" ON public.scholarships FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- User-owned Attempts, Results, Subscriptions, Chat Sessions & Messages
CREATE POLICY "attempts_own_all" ON public.attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "results_own_all" ON public.results FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscriptions_own_all" ON public.subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_sessions_own_all" ON public.chat_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_messages_own_all" ON public.chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto profile + first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- app_settings singleton
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  environment TEXT NOT NULL DEFAULT 'demo' CHECK (environment IN ('demo','live')),
  live_confirmed BOOLEAN NOT NULL DEFAULT false,
  auto_execute BOOLEAN NOT NULL DEFAULT false,
  min_confidence NUMERIC NOT NULL DEFAULT 0.65,
  max_risk_per_trade_pct NUMERIC NOT NULL DEFAULT 0.02,
  max_daily_loss_pct NUMERIC NOT NULL DEFAULT 0.05,
  session_start_est TEXT NOT NULL DEFAULT '09:30',
  session_end_est TEXT NOT NULL DEFAULT '16:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
INSERT INTO public.app_settings (id) VALUES (1);

-- instruments
CREATE TABLE public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  min_stop_distance_points NUMERIC NOT NULL,
  tick_value_per_point NUMERIC NOT NULL DEFAULT 1.0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instruments TO authenticated;
GRANT ALL ON public.instruments TO service_role;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all instruments" ON public.instruments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.instruments (epic,name,type,min_stop_distance_points,tick_value_per_point) VALUES
  ('IX.D.NASDAQ.IFS.IP','US Tech 100','index',5,1.0),
  ('CS.D.EURUSD.CFD.IP','EUR/USD','forex',6,1.0),
  ('CS.D.GBPUSD.CFD.IP','GBP/USD','forex',6,1.0),
  ('CS.D.BTCUSD.CFD.IP','Bitcoin','crypto',200,1.0);

-- signals
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  epic TEXT NOT NULL,
  name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  confidence NUMERIC,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  raw JSONB
);
CREATE INDEX signals_created_idx ON public.signals(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read signals" ON public.signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  epic TEXT NOT NULL,
  direction TEXT NOT NULL,
  size NUMERIC NOT NULL,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  deal_reference TEXT,
  deal_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  fill_level NUMERIC,
  closed_at TIMESTAMPTZ,
  close_level NUMERIC,
  realized_pnl NUMERIC,
  raw JSONB
);
CREATE INDEX orders_created_idx ON public.orders(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- daily_pnl
CREATE TABLE public.daily_pnl (
  date DATE PRIMARY KEY,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  equity_open NUMERIC,
  equity_close NUMERIC,
  loss_cap_hit BOOLEAN NOT NULL DEFAULT false,
  positions_closed_at_eod INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_pnl TO authenticated;
GRANT ALL ON public.daily_pnl TO service_role;
ALTER TABLE public.daily_pnl ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pnl" ON public.daily_pnl FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER daily_pnl_updated BEFORE UPDATE ON public.daily_pnl FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- trade_log
CREATE TABLE public.trade_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,
  message TEXT,
  data JSONB
);
CREATE INDEX trade_log_created_idx ON public.trade_log(created_at DESC);
GRANT SELECT ON public.trade_log TO authenticated;
GRANT ALL ON public.trade_log TO service_role;
ALTER TABLE public.trade_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read log" ON public.trade_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

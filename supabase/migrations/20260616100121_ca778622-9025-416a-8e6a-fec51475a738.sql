
-- Notification settings (singleton)
CREATE TABLE public.notification_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_enabled boolean NOT NULL DEFAULT false,
  email_to text,
  webhook_enabled boolean NOT NULL DEFAULT false,
  webhook_url text,
  notify_on_loss_cap boolean NOT NULL DEFAULT true,
  notify_on_eod boolean NOT NULL DEFAULT false,
  notify_on_errors boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read notif" ON public.notification_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write notif" ON public.notification_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_notif_upd BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Job runs
CREATE TABLE public.job_runs (
  id bigserial PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  summary jsonb,
  duration_ms integer,
  error text
);
GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read job_runs" ON public.job_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_job_runs_job_started ON public.job_runs(job_name, started_at DESC);

-- app_settings: dry_run + loss-cap notify date
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loss_cap_notified_date date;

-- daily_pnl: eod_closed_at
ALTER TABLE public.daily_pnl
  ADD COLUMN IF NOT EXISTS eod_closed_at timestamptz;

-- Reschedule EOD: minute-gate cron covering both EST/EDT
DO $$
BEGIN
  PERFORM cron.unschedule('vdnx-eod-close');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vdnx-eod-close-gate',
  '50-59 20-21 * * 1-5',
  $$ SELECT net.http_post(
    url := 'https://project--a3ace40a-4c25-4447-8804-4c6a5c5bd13d.lovable.app/api/public/eod-close',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkYnh5d2Flb2hzc3pkZnN2bnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjQwOTIsImV4cCI6MjA5NzE0MDA5Mn0.MWXlIPeENCuJVG8XTAYdgcv7Ot_FsZdmId7-5YiQqfI"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);

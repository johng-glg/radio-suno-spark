-- Delete the problematic cron job and recreate it with correct schedule
SELECT cron.unschedule('complete-pending-generations');

-- Recreate with correct cron format (every 30 seconds)
SELECT cron.schedule(
  'complete-pending-generations-fixed',
  '*/1 * * * *', -- Every minute (pg_cron doesn't support seconds)
  $$
  SELECT
    net.http_post(
      url:='https://kbvsckoacdgpgiiqrhqv.supabase.co/functions/v1/complete-pending-generations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidnNja29hY2RncGdpaXFyaHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDg1ODEsImV4cCI6MjA3NDU4NDU4MX0.5RwQsg-GySXj3Gs63gCGBZwax2ujqd6G1nLaUcLejXY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
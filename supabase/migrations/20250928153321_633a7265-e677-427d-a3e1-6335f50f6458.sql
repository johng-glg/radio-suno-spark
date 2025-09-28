-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the complete-pending-generations function to run every 30 seconds
SELECT cron.schedule(
  'complete-pending-generations',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT
    net.http_post(
      url:='https://kbvsckoacdgpgiiqrhqv.supabase.co/functions/v1/complete-pending-generations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidnNja29hY2RncGdpaXFyaHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDg1ODEsImV4cCI6MjA3NDU4NDU4MX0.5RwQsg-GySXj3Gs63gCGBZwax2ujqd6G1nLaUcLejXY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule the check-pending-songs function to run every 2 minutes to clean up old songs  
SELECT cron.schedule(
  'check-pending-songs',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url:='https://kbvsckoacdgpgiiqrhqv.supabase.co/functions/v1/check-pending-songs',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidnNja29hY2RncGdpaXFyaHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDg1ODEsImV4cCI6MjA3NDU4NDU4MX0.5RwQsg-GySXj3Gs63gCGBZwax2ujqd6G1nLaUcLejXY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule the check-stuck-songs function to run every 5 minutes
SELECT cron.schedule(
  'check-stuck-songs', 
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:='https://kbvsckoacdgpgiiqrhqv.supabase.co/functions/v1/check-stuck-songs',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidnNja29hY2RncGdpaXFyaHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDg1ODEsImV4cCI6MjA3NDU4NDU4MX0.5RwQsg-GySXj3Gs63gCGBZwax2ujqd6G1nLaUcLejXY"}'::jsonb,
      body:='{}'::jsonb  
    ) as request_id;
  $$
);
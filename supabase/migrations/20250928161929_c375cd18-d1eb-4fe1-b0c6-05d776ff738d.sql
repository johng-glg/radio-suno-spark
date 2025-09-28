-- Fix the resubmission success tracking for the jazz tracks
-- Mark song 5880ad6d as succeeded since its resubmission (183aebee) completed
UPDATE public.songs 
SET 
  resubmission_succeeded_at = '2025-09-28 15:57:00.744521+00:00',
  updated_at = now()
WHERE id = '5880ad6d-9e82-4974-aa8a-98dfdb9d1629';

-- Mark song 30425f70 as succeeded since its resubmission chain ultimately succeeded
UPDATE public.songs 
SET 
  resubmission_succeeded_at = '2025-09-28 15:57:00.744521+00:00', 
  updated_at = now()
WHERE id = '30425f70-76fe-48d4-900b-02062480b97c';
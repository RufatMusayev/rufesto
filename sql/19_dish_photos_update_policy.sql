-- Fix dish-photo upload RLS: upsert:true makes the storage write an UPDATE,
-- but the bucket only had SELECT/INSERT/DELETE policies → uploads to an
-- existing path failed with "new row violates row-level security policy".
-- Add the missing UPDATE policy so upsert re-uploads work for any authenticated staff.

DROP POLICY IF EXISTS "dish_photos_update" ON storage.objects;

CREATE POLICY "dish_photos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'dish-photos' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'dish-photos' AND auth.role() = 'authenticated');

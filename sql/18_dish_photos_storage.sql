-- Storage bucket (created via Supabase)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('dish-photos', 'dish-photos', true);

-- RLS on dish_photos table
CREATE POLICY "dish_photos_public_read" ON dish_photos FOR SELECT USING (true);

CREATE POLICY "dish_photos_staff_write" ON dish_photos FOR ALL
  USING (is_manager_of((SELECT restaurant_id FROM dishes WHERE id = dish_id)));

-- Storage object policies
CREATE POLICY "dish_photos_read" ON storage.objects FOR SELECT USING (bucket_id = 'dish-photos');

CREATE POLICY "dish_photos_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dish-photos' AND auth.role() = 'authenticated');

CREATE POLICY "dish_photos_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'dish-photos' AND auth.role() = 'authenticated');

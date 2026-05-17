-- Fix missing RLS policies that block user operations

-- Payments: users can insert and view their own payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own payments' AND tablename = 'payments'
  ) THEN
    CREATE POLICY "Users can insert own payments"
      ON payments FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own payments' AND tablename = 'payments'
  ) THEN
    CREATE POLICY "Users can view own payments"
      ON payments FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Notifications: authenticated users can insert (payment requests, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Authenticated users can insert notifications"
      ON notifications FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Tables: authenticated users can update state (confirm arrival, clear after payment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can update table state' AND tablename = 'tables'
  ) THEN
    CREATE POLICY "Authenticated users can update table state"
      ON tables FOR UPDATE
      USING (true)
      WITH CHECK (state IN ('occupied', 'ordering', 'awaiting_payment', 'cleared'));
  END IF;
END $$;

-- Saved dishes: table + policies defined in 14_saved_dishes.sql (run that first)

-- Reviews: ensure users can insert their own reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own reviews' AND tablename = 'reviews'
  ) THEN
    CREATE POLICY "Users can insert own reviews"
      ON reviews FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

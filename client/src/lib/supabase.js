import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qqwvtuckljwvwrvyrjbn.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd3Z0dWNrbGp3dndydnlyamJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwODU1NjAsImV4cCI6MjA5MzY2MTU2MH0.XFQVgPqebW1Afgq8VvANsqBwlyoB_aOrWfCikMvHqfI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

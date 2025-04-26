import { createClient } from '@supabase/supabase-js'

// Ensure NEXT_PUBLIC_ variables are used for browser access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Check if environment variables are set
if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
}
if (!supabaseAnonKey) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

// Create and export the Supabase client instance
// This instance can be imported and used directly in your client components.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

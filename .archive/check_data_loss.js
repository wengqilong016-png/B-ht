// ⚠️  DO NOT hardcode the service_role key here — pass it via environment variable:
//    SUPABASE_SERVICE_ROLE_KEY=<your_key> node check_data_loss.js
// Find the key in Supabase Dashboard → Settings → API → service_role (secret).
import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

async function checkData() {
  console.log('=== Checking Database Data Counts ===')
  
  const tables = ['drivers', 'locations', 'transactions', 'profiles', 'daily_settlements', 'ai_logs', 'notifications']
  
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`❌ ${table}: ${error.message}`)
    } else {
      console.log(`✅ ${table}: ${count} rows`)
    }
  }

  // Check Auth Users
  const { data: users, error: userError } = await supabase.auth.admin.listUsers()
  if (userError) {
    console.log(`❌ Auth Users: ${userError.message}`)
  } else {
    console.log(`✅ Auth Users: ${users.users.length} users`)
  }
}

checkData()

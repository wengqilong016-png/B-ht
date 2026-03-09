import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
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

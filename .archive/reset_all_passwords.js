import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_KEY (service_role) is not defined in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function resetAllPasswords() {
  console.log('Fetching all users...');
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error listing users:', error.message);
    return;
  }

  console.log(`Found ${users.length} users. Starting password reset to "000000"...`);

  for (const user of users) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: '000000'
    });

    if (updateError) {
      console.error(`Failed to reset password for ${user.email}:`, updateError.message);
    } else {
      console.log(`Successfully reset password for: ${user.email}`);
    }
  }

  console.log('--- All password resets completed ---');
}

resetAllPasswords();

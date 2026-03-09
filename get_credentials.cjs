const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envLocalStr = fs.readFileSync('.env.local', 'utf8');
const envUrl = envLocalStr.match(/SUPABASE_URL=(.*)/)?.[1]?.trim();
const envKey = envLocalStr.match(/SUPABASE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(envUrl, envKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  console.log('--- Fixing Admin Account ---');
  // Find all profiles
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) console.error('Error fetching profiles:', profErr);
  
  let adminProfile = profiles?.find(p => p.role === 'admin');
  
  const adminEmail = 'admin@bahati.com';
  const adminPassword = 'AdminPassword123!';
  
  if (!adminProfile) {
    console.log('No admin profile found. Creating a new admin user...');
    
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true
    });
    
    if (createErr) {
      console.error('Failed to create admin user:', createErr);
    } else if (newUser?.user) {
      console.log('Created user ID:', newUser.user.id);
      const { error: insertErr } = await supabase.from('profiles').upsert({
        auth_user_id: newUser.user.id,
        role: 'admin',
        display_name: 'Super Admin'
      });
      if (insertErr) console.error('Failed to insert admin profile:', insertErr);
      else console.log(`SUCCESS! New Admin Login:\nEmail: ${adminEmail}\nPassword: ${adminPassword}`);
    }
  } else {
    console.log('Found existing admin profile for auth_user_id:', adminProfile.auth_user_id);
    
    // Find the auth user email to tell the user
    const { data: usersData, error: usersErr } = await supabase.auth.admin.getUserById(adminProfile.auth_user_id);
    
    if (usersData?.user) {
      console.log('Existing Admin Email found:', usersData.user.email);
      console.log('Resetting password for this admin...');
      
      const { error: updateErr } = await supabase.auth.admin.updateUserById(
        adminProfile.auth_user_id,
        { password: adminPassword }
      );
      
      if (updateErr) {
        console.error('Failed to update password:', updateErr);
      } else {
        console.log(`SUCCESS! Reset Admin Login:\nEmail: ${usersData.user.email}\nPassword: ${adminPassword}`);
      }
    } else {
      console.error('Could not fetch existing admin user from auth.users:', usersErr);
    }
  }
  
  console.log('\n--- Fetching Trial Machine Data (Locations) ---');
  const { data: locations, error: locErr } = await supabase.from('locations').select('*').limit(10);
  if (locErr) console.error('Error fetching locations:', locErr);
  else {
    console.log(`Found ${locations.length} locations/machines.`);
    locations.forEach(loc => {
      console.log(`- Machine ID: ${loc.machineId || 'N/A'}, Name: ${loc.name}, Area: ${loc.area || 'N/A'}, Status: ${loc.status}, Debt: ${loc.remainingStartupDebt}`);
    });
  }

  console.log('\n--- Fetching Recent Transactions ---');
  const { data: txs, error: txErr } = await supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(5);
  if (txErr) console.error('Error fetching transactions:', txErr);
  else {
    console.log(`Found ${txs.length} recent transactions.`);
    txs.forEach(tx => {
      console.log(`- Tx: ${tx.id}, Machine: ${tx.locationName}, Driver: ${tx.driverName}, Revenue: ${tx.revenue}, Net: ${tx.netPayable}`);
    });
  }
}

main();
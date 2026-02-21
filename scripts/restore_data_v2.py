import os
import requests
import json
import uuid

# --- AUTO-LOAD ENV ---
def load_env():
    env_path = "/data/data/com.termux/files/home/B-ht/.env.local"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v.strip('"').strip("'")

load_env()
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
HEADERS = {
    "apikey": SUPABASE_KEY, 
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def seed_driver_system():
    drivers_list = ["Rajabu", "Nurdin", "Sudi", "Kombo", "Mtolo", "Mliki"]
    
    # 1. Clean existing unassigned or pending locations
    requests.delete(f"{SUPABASE_URL}/rest/v1/locations?area=eq.TO%20BE%20SET", headers=HEADERS)

    all_locations = []
    for name in drivers_list:
        driver_id = f"D-{name.upper()}"
        prefix = name[:2].upper()
        
        print(f"📦 Creating 20 slots for {name}...")
        for i in range(1, 21):
            machine_id = f"{prefix}-{i:03d}"
            all_locations.append({
                "id": str(uuid.uuid4()), 
                "name": f"New Site ({machine_id})",
                "machineId": machine_id,
                "area": "TO BE SET",
                "assignedDriverId": driver_id,
                "status": "maintenance",
                "lastScore": 0,
                "commissionRate": 0.15,
                "initialStartupDebt": 0,
                "remainingStartupDebt": 0,
                "isSynced": True,
                "ownerName": "PENDING"
            })

    # 2. Batch Injection
    print(f"🚀 Injecting {len(all_locations)} location slots...")
    res = requests.post(f"{SUPABASE_URL}/rest/v1/locations", headers=HEADERS, json=all_locations)
    if res.status_code in [200, 201]:
        print("✅ 120 slots successfully created and assigned to respective drivers.")
    else:
        print(f"❌ Error: {res.text}")

if __name__ == "__main__":
    seed_driver_system()

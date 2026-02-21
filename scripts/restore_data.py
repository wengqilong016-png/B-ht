
import os
import requests
import json

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

def seed_drivers():
    drivers_list = ["Rajabu", "Nurdin", "Sudi", "Kombo", "Mtolo", "Mliki"]
    data = []
    for name in drivers_list:
        driver_id = f"D-{name.upper()}"
        data.append({
            "id": driver_id,
            "name": name,
            "username": name.lower(),
            "password": "123",
            "phone": "+255 000 000 000",
            "initialDebt": 0,
            "remainingDebt": 0,
            "dailyFloatingCoins": 10000,
            "vehicleInfo": {"model": "Motorcycle", "plate": "T-000-XXX"},
            "status": "active",
            "baseSalary": 300000,
            "commissionRate": 0.05,
            "isSynced": True
        })
    
    print(f"🚀 Seeding {len(data)} drivers...")
    res = requests.post(f"{SUPABASE_URL}/rest/v1/drivers", headers=HEADERS, json=data)
    if res.status_code in [200, 201]:
        print("✅ Drivers seeded successfully.")
    else:
        print(f"❌ Failed to seed drivers: {res.text}")

def seed_locations():
    data = []
    # Create 20 template machines
    for i in range(1, 21):
        mid = f"M-{i:03d}"
        data.append({
            "name": f"Template Site {mid}",
            "machineId": mid,
            "area": "Unassigned",
            "lastScore": 0,
            "status": "active",
            "commissionRate": 0.15,
            "initialStartupDebt": 0,
            "remainingStartupDebt": 0,
            "isSynced": True
        })
    
    print(f"🚀 Seeding {len(data)} machines...")
    res = requests.post(f"{SUPABASE_URL}/rest/v1/locations", headers=HEADERS, json=data)
    if res.status_code in [200, 201]:
        print("✅ Machines seeded successfully.")
    else:
        print(f"❌ Failed to seed machines: {res.text}")

if __name__ == "__main__":
    seed_drivers()
    seed_locations()


import os
import time
import requests
import math
from datetime import datetime, timedelta

# --- CONFIG ---
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
HEADERS = {
    "apikey": SUPABASE_KEY, 
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def get_recent_transactions(hours=24):
    """Fetch transactions from the last N hours."""
    time_threshold = (datetime.now() - timedelta(hours=hours)).isoformat()
    url = f"{SUPABASE_URL}/rest/v1/transactions?timestamp=gt.{time_threshold}&select=*,driverId,locationId,revenue,gps"
    res = requests.get(url, headers=HEADERS)
    return res.json() if res.status_code == 200 else []

def analyze_gps_fraud(transactions):
    """Detect if a driver is faking visits (high transactions but no movement)."""
    driver_stats = {}
    
    for tx in transactions:
        did = tx.get('driverId')
        gps = tx.get('gps') or {'lat': 0, 'lng': 0}
        
        if did not in driver_stats:
            driver_stats[did] = {'count': 0, 'positions': [], 'total_rev': 0}
        
        driver_stats[did]['count'] += 1
        driver_stats[did]['total_rev'] += tx.get('revenue', 0)
        driver_stats[did]['positions'].append((gps['lat'], gps['lng']))

    alerts = []
    for did, stats in driver_stats.items():
        if stats['count'] < 5: continue # Ignore low activity
        
        # Calculate max distance between any two points
        max_dist = 0
        points = stats['positions']
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                d = calc_distance(points[i], points[j])
                if d > max_dist: max_dist = d
        
        # RULE: If >5 transactions with high revenue but moving < 50 meters
        if max_dist < 0.05 and stats['total_rev'] > 50000:
            alerts.append(f"⚠️ SUSPICIOUS: Driver {did} processed {stats['count']} transactions ({stats['total_rev']} TZS) but moved only {max_dist*1000:.1f} meters!")
            
    return alerts

def calc_distance(p1, p2):
    # Haversine formula approximation
    R = 6371 # Earth radius in km
    dlat = math.radians(p2[0] - p1[0])
    dlon = math.radians(p2[1] - p1[1])
    a = math.sin(dlat/2)**2 + math.cos(math.radians(p1[0])) * math.cos(math.radians(p2[0])) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def log_alert(message):
    """Push alert to AI Logs (which Admin can see in Dashboard)."""
    print(message)
    payload = {
        "driverId": "SYSTEM-WATCHDOG",
        "driverName": "🛡️ 守护者 Guardian",
        "query": "Security Scan",
        "response": message,
        "modelUsed": "rule-engine-v1",
        "timestamp": datetime.now().isoformat()
    }
    requests.post(f"{SUPABASE_URL}/rest/v1/ai_logs", headers=HEADERS, json=payload)

def run_patrol():
    print("🛡️ Guardian Watchdog Starting Patrol...")
    txs = get_recent_transactions(24)
    
    # Check 1: GPS Fraud
    gps_alerts = analyze_gps_fraud(txs)
    for alert in gps_alerts:
        log_alert(alert)
        
    if not gps_alerts:
        print("✅ No suspicious activity detected.")

if __name__ == "__main__":
    run_patrol()

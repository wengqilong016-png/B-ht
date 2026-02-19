import os
import json
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client, Client

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://jhoyqqpuousxawdydlwe.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3lxcXB1b3VzeGF3ZHlkbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njk1MzAsImV4cCI6MjA4NzA0NTUzMH0.PIwZIxQihCcJ0ReNoZniJq244hWXcjlXGEOHZhKORoY')

# Initialize Supabase client
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✓ Supabase client initialized successfully")
except Exception as e:
    print(f"✗ Failed to initialize Supabase client: {e}")
    supabase = None

# ===== HEALTH CHECK ENDPOINTS =====

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat(),
        'database': 'checking...'
    })

@app.route('/api/db/health', methods=['GET'])
def db_health_check():
    """Check Supabase database connectivity"""
    if not supabase:
        return jsonify({
            'status': 'error',
            'message': 'Supabase client not initialized',
            'timestamp': datetime.utcnow().isoformat()
        }), 500
    
    try:
        # Simple query to verify connection
        response = supabase.table('drivers').select('id').limit(1).execute()
        return jsonify({
            'status': 'connected',
            'message': 'Database connection successful',
            'timestamp': datetime.utcnow().isoformat(),
            'data': response.data if response else []
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Database connection failed: {str(e)}',
            'timestamp': datetime.utcnow().isoformat()
        }), 500

# ===== DATA RETRIEVAL ENDPOINTS =====

@app.route('/api/drivers', methods=['GET'])
def get_drivers():
    """Get all drivers from database"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        response = supabase.table('drivers').select('*').execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data) if response.data else 0
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/locations', methods=['GET'])
def get_locations():
    """Get all locations (machines) from database"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        response = supabase.table('locations').select('*').execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data) if response.data else 0
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get transactions (optionally filtered by date or driver)"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        driver_id = request.args.get('driverId')
        date_from = request.args.get('dateFrom')
        
        query = supabase.table('transactions').select('*')
        
        if driver_id:
            query = query.eq('driverId', driver_id)
        if date_from:
            query = query.gte('timestamp', date_from)
        
        response = query.order('timestamp', desc=True).execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data) if response.data else 0
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ===== DATA SYNC ENDPOINTS =====

@app.route('/api/sync/transactions', methods=['POST'])
def sync_transactions():
    """Sync transactions from frontend to database"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        data = request.get_json()
        transactions = data.get('transactions', [])
        
        if not transactions:
            return jsonify({
                'status': 'error',
                'message': 'No transactions provided'
            }), 400
        
        # Upsert transactions (insert or update)
        for txn in transactions:
            txn['isSynced'] = True
            txn['timestamp'] = txn.get('timestamp', datetime.utcnow().isoformat())
        
        response = supabase.table('transactions').upsert(transactions).execute()
        
        return jsonify({
            'status': 'success',
            'message': f'Synced {len(response.data)} transactions',
            'data': response.data
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/sync/drivers', methods=['POST'])
def sync_drivers():
    """Sync driver data from frontend to database"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        data = request.get_json()
        drivers = data.get('drivers', [])
        
        if not drivers:
            return jsonify({
                'status': 'error',
                'message': 'No drivers provided'
            }), 400
        
        # Upsert drivers
        for driver in drivers:
            driver['isSynced'] = True
        
        response = supabase.table('drivers').upsert(drivers).execute()
        
        return jsonify({
            'status': 'success',
            'message': f'Synced {len(response.data)} drivers',
            'data': response.data
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/sync/locations', methods=['POST'])
def sync_locations():
    """Sync location data from frontend to database"""
    if not supabase:
        return jsonify({'error': 'Supabase not initialized'}), 500
    
    try:
        data = request.get_json()
        locations = data.get('locations', [])
        
        if not locations:
            return jsonify({
                'status': 'error',
                'message': 'No locations provided'
            }), 400
        
        # Upsert locations
        for location in locations:
            location['isSynced'] = True
        
        response = supabase.table('locations').upsert(locations).execute()
        
        return jsonify({
            'status': 'success',
            'message': f'Synced {len(response.data)} locations',
            'data': response.data
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ===== ERROR HANDLERS =====

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ===== MAIN =====

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False') == 'True'
    print(f"Starting API server on port {port} (Debug: {debug})")
    app.run(host='0.0.0.0', port=port, debug=debug)
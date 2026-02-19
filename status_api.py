import os
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime

# Try to import supabase, fallback if not available
try:
    from supabase import create_client, Client
except ImportError:
    Client = None

app = Flask(__name__)
CORS(app)

# Environment variables
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

# Initialize Supabase client
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY and Client:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Failed to initialize Supabase: {e}")

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check overall API health status"""
    try:
        db_health = check_db_health()
        return jsonify({
            'status': 'healthy' if db_health else 'degraded',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'connected' if db_health else 'disconnected'
        }), 200 if db_health else 503
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/api/db/status', methods=['GET'])
def db_status():
    """Check database connectivity"""
    try:
        health = check_db_health()
        return jsonify({
            'connected': health,
            'url': SUPABASE_URL or 'Not configured',
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'connected': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/api/drivers', methods=['GET'])
def get_drivers():
    """Get all drivers from database"""
    if not supabase:
        return jsonify({'error': 'Database not configured'}), 503
    
    try:
        response = supabase.table('drivers').select('*').execute()
        return jsonify({
            'data': response.data,
            'count': len(response.data),
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get recent transactions"""
    if not supabase:
        return jsonify({'error': 'Database not configured'}), 503
    
    try:
        limit = request.args.get('limit', 100, type=int)
        response = supabase.table('transactions').select('*').order('timestamp', desc=True).limit(limit).execute()
        return jsonify({
            'data': response.data,
            'count': len(response.data),
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/api/locations', methods=['GET'])
def get_locations():
    """Get all machine locations"""
    if not supabase:
        return jsonify({'error': 'Database not configured'}), 503
    
    try:
        response = supabase.table('locations').select('*').execute()
        return jsonify({
            'data': response.data,
            'count': len(response.data),
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

def check_db_health() -> bool:
    """Check if database is reachable and configured"""
    if not supabase or not SUPABASE_URL:
        return False
    
    try:
        response = supabase.table('drivers').select('id').limit(1).execute()
        return True
    except Exception as e:
        print(f"Database health check failed: {e}")
        return False

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get API configuration (sanitized)"""
    return jsonify({
        'supabase_url': SUPABASE_URL or 'Not configured',
        'has_api_key': bool(SUPABASE_KEY),
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)
#!/bin/bash
# BHT Project - Supabase Connection Setup Script
# Date: 2026-04-23

set -e

echo "=== BHT - Supabase Connection Setup ==="
echo ""

# Check if .env exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

echo ""
echo "Please enter your Supabase credentials:"
echo "(Get them from: https://supabase.com/dashboard → Settings → API)"
echo ""

# Get Supabase URL
read -p "Project URL (https://xxxxx.supabase.co): " supabase_url

# Get Supabase anon key
read -p "Anon public key (eyJhbG...): " supabase_key

# Validate inputs
if [[ -z "$supabase_url" ]] || [[ -z "$supabase_key" ]]; then
    echo "❌ Error: URL and key are required"
    exit 1
fi

# Create .env file
cat > .env << EOF
# BHT Project - Supabase Configuration
# Created: $(date '+%Y-%m-%d %H:%M:%S')

# Supabase Cloud Configuration
VITE_SUPABASE_URL=${supabase_url}
VITE_SUPABASE_ANON_KEY=${supabase_key}

# Optional: Enable debug mode (uncomment to enable)
# VITE_DEBUG_MODE=true
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "Configuration:"
echo "  URL:  ${supabase_url}"
echo "  Key:  ${supabase_key:0:20}..."
echo ""
echo "Next steps:"
echo "  1. Run: npm run dev"
echo "  2. Open: http://localhost:5173"
echo "  3. Test login and data fetching"
echo ""

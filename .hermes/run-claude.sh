#!/bin/bash
source ~/.hermes-proot/.env
export PATH="$HOME/.bun/bin:$PATH"
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
export ANTHROPIC_API_KEY=""
cd /home/jack/bht
exec claude

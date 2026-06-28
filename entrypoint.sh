#!/bin/sh
set -e

# Apply database schema migrations on startup
echo "Applying database schema migrations..."
npx drizzle-kit push

# Start the application
echo "Starting Next.js application..."
exec "$@"

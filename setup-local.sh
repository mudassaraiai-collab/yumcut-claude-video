#!/bin/bash
echo "Setting up .env for local development..."

# Remove old broken lines and add correct ones
grep -v "ALLOW_NO_OAUTH\|NEXTAUTH_URL\|NEXTAUTH_SECRET\|DATABASE_URL\|SERVICE_API_PASSWORD\|DAEMON_API_PASSWORD\|NEXT_PUBLIC_STORAGE_BASE_URL\|STORAGE_PUBLIC_URL" .env > .env.tmp
mv .env.tmp .env

cat >> .env << 'EOF'
ALLOW_NO_OAUTH=1
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=yumcut-local-dev-secret-key
DATABASE_URL=file:./dev.db
SERVICE_API_PASSWORD=local-dev-password
DAEMON_API_PASSWORD=local-dev-password
NEXT_PUBLIC_STORAGE_BASE_URL=http://localhost:3000
STORAGE_PUBLIC_URL=http://localhost:3000
EOF

echo "Done! Setting up database..."
npx prisma db push --accept-data-loss

echo ""
echo "==============================="
echo "  Starting YumCut app..."
echo "==============================="
npm run dev

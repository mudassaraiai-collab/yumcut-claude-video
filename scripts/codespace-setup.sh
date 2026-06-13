#!/bin/bash
# YumCut Claude Video - Auto Setup Script
# Runs automatically when Codespace opens

echo ""
echo "========================================="
echo "  YumCut Claude Video - Auto Setup"
echo "========================================="
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
npm install @anthropic-ai/sdk
echo "✅ Dependencies installed"

# Setup .env if not exists
if [ ! -f .env ]; then
  cp example.env .env
  echo "✅ .env file created from example.env"
else
  echo "✅ .env already exists"
fi

# Check if ANTHROPIC_API_KEY is set
if grep -q "paste_your_key_here" .env || ! grep -q "ANTHROPIC_API_KEY" .env; then
  echo ""
  echo "⚠️  ACTION REQUIRED:"
  echo "   Open .env file and replace 'paste_your_key_here' with your real API key"
  echo "   Get your key at: https://console.anthropic.com/settings/keys"
  echo ""
else
  echo "✅ ANTHROPIC_API_KEY is set"
fi

echo ""
echo "========================================="
echo "  Setup complete! Starting app..."
echo "========================================="
echo ""
echo "🌐 App will be available at:"
echo "   http://localhost:3000"
echo ""
echo "📺 Kids Lego Videos:"
echo "   http://localhost:3000/lego"
echo ""
echo "✨ Claude Generator:"
echo "   http://localhost:3000/claude"
echo ""

npm run dev

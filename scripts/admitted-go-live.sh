#!/usr/bin/env bash
# Admitted go-live: sets the production environment variables on Vercel project trnd-admitted, then redeploys.
# Run from the repo root:  bash scripts/admitted-go-live.sh
# Each step asks first and can be skipped. Secrets are read without echoing and never written to disk.
set -euo pipefail

PROJECT="trnd-admitted"
SCOPE="nimarcenelles-projects"
SITE="https://admitted.usetrnd.com"

ask() { read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }

# Replaces a production variable with a value read from stdin.
put() {
  local name="$1" value="$2"
  vercel env rm "$name" production --project "$PROJECT" --scope "$SCOPE" --yes >/dev/null 2>&1 || true
  printf %s "$value" | vercel env add "$name" production --project "$PROJECT" --scope "$SCOPE" --sensitive >/dev/null
  echo "  set $name"
}

echo "1/3  Email: access links after purchase and /essay/recover"
if ask "Copy RESEND_API_KEY from .env.creators.local (the send-only key creators uses)?"; then
  key=$(grep -E '^RESEND_API_KEY=' .env.creators.local | cut -d= -f2- | tr -d '"')
  [[ "$key" == re_* ]] || { echo "  No re_ key found in .env.creators.local"; exit 1; }
  put RESEND_API_KEY "$key"
fi

echo "2/3  Stripe live mode"
if ask "Set the live Stripe secret key now?"; then
  read -r -s -p "  Paste sk_live_… or rk_live_… (hidden): " key; echo
  [[ "$key" == sk_live_* || "$key" == rk_live_* ]] || { echo "  That isn't a live key; nothing changed."; exit 1; }
  put STRIPE_SECRET_KEY "$key"
fi

echo "3/3  Admitted's own Supabase project"
echo "  First run supabase/migrations/0200_ai_results.sql in the new project's SQL editor."
if ask "Set ADMITTED_SUPABASE_URL and ADMITTED_SUPABASE_SERVICE_ROLE_KEY now?"; then
  read -r -p "  Project URL (https://….supabase.co): " url
  [[ "$url" == https://*.supabase.co ]] || { echo "  That isn't a Supabase project URL; nothing changed."; exit 1; }
  read -r -s -p "  Service role key (hidden): " key; echo
  put ADMITTED_SUPABASE_URL "$url"
  put ADMITTED_SUPABASE_SERVICE_ROLE_KEY "$key"
fi

if ask "Redeploy production so the changes take effect?"; then
  vercel redeploy "$SITE" --environment production --scope "$SCOPE"
fi
echo "Done. Then buy a \$19 Week Pass on $SITE/pricing, check the access email arrives, and refund it in Stripe."

/** Load .env.local for tsx-run scripts (Next.js does this itself in-app). */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local yet — demo mode */
}

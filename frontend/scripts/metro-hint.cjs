#!/usr/bin/env node
/**
 * Expo CLI always prints: Metro waiting on exp://<LAN>:8081
 * That is ONLY the dev server that sends JS to Expo Go — not your FastAPI URL.
 * API base comes from EXPO_PUBLIC_API_URL in .env (typically port 8000).
 */
console.log(`
[Visioryx] Metro will show exp://…:8081 — normal (JS bundler). API = EXPO_PUBLIC_API_URL (:8000).
[Visioryx] If Expo Go says "problem running the requested app": update Expo Go from the App Store, same Wi‑Fi as this Mac, or run: npm run start:tunnel
`);

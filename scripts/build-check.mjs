// Nov 8 (Jade): builds a test copy for the accessibility check.
// Uses fake Supabase keys, so it never talks to the real database.
import { build } from 'vite'

process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
await build({ build: { outDir: 'dist-check', emptyOutDir: true }, logLevel: 'warn' })

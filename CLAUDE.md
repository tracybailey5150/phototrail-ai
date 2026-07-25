# PhotoTrail AI — Intelligent Photo Organization & Evidence Platform

## Project
- **Domain:** phototrail-ai.vercel.app (custom domain TBD)
- **Repo:** tracybailey5150/phototrail-ai
- **Supabase project:** wwnvebnfjeemaakieqei
- **Vercel project:** TBD (after first deploy)
- **Stack:** Next.js 16, TypeScript, Tailwind v4, Supabase (Auth + Postgres + Storage), Anthropic Claude, Zod, react-hook-form

## What This Is
AI-powered photo organization platform with two modes:
1. **Travel & Life** — trips, days, events, locations, memories
2. **Project & Job Site** — clients, projects, sites, rooms, equipment, serial numbers, evidence

Core principle: Never present AI assumptions as verified. Every AI-derived field carries value, source, confidence score, and verification status.

## Status: Phase 1 (Foundation)
- Auth, organizations, collections CRUD, navigation shell
- Phase 2: file upload, EXIF extraction, thumbnails, AI analysis
- Phase 3: location/time resolution, reverse geocoding
- Phase 4: Claude visual analysis, OCR
- Phase 5: auto-grouping engine
- Phase 6: timeline, gallery, map, search
- Phase 7: reports and exports
- Phase 8: hardening

## Key Patterns
- Custom UI components (NOT shadcn/ui) — amber (#F59E0B) accents
- 3 Supabase clients: client.ts (browser), server.ts (server), admin.ts (service role)
- API routes for all mutations (not Server Actions), Zod validation
- Activity logging to activity_events table
- Multi-tenant with org_id on all tables, RLS enforced
- Storage: originals (private), derivatives (public) buckets

## Owner Preferences
- Autonomous execution — don't ask, just do it
- Deploy without asking — push when ready
- Build better than competition
- No extras — no co-author tags or unsolicited additions
- AI models: Anthropic Opus → Sonnet → OpenAI (raw fetch, no SDK), always use max_completion_tokens

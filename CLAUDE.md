# PhotoTrail AI — Intelligent Photo Organization & Evidence Platform

## Project
- **Domain:** phototrailai.com
- **Repo:** tracybailey5150/phototrail-ai
- **Supabase project:** wwnvebnfjeemaakieqei
- **Vercel project:** prj_Ytcr2qIxi7pb39XOfPEM0N7qhKKg
- **Stack:** Next.js 16, TypeScript, Tailwind v4, Supabase (Auth + Postgres + Storage), Anthropic Claude, Zod, react-hook-form

## What This Is
AI-powered photo organization platform with two modes:
1. **Travel & Life** — trips, days, events, locations, memories
2. **Project & Job Site** — clients, projects, sites, rooms, equipment, serial numbers, evidence

Core principle: Never present AI assumptions as verified. Every AI-derived field carries value, source, confidence score, and verification status.

## Status: MVP Complete (All 8 Phases)
- Phase 1: Auth, orgs, collections, nav shell
- Phase 2: Upload, EXIF, thumbnails, SHA-256 dedup
- Phase 3: Reverse geocoding, timezone, timestamp resolution
- Phase 4: Claude AI visual analysis, OCR, equipment extraction
- Phase 5: Auto-grouping (trips/days/events for travel, rooms for project)
- Phase 6: Timeline, map, search (AI-powered)
- Phase 7: Reports, exports (JSON/CSV), review queue
- Phase 8: Settings, upload history, processing status

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

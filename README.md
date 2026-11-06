# Kalolsavam Live

Static site (no build step) backed by Supabase project `KALOLSAVAM LIVE`.

- `index.html` + `app.js`: public live board AND admin mode in one page (admin login is hidden: footer "Admin" link or `#admin`)
- `admin.html`: redirects to `index.html#admin`
- `publish-help.html`: step-by-step hosting guide
- `config.js`: Supabase URL + anon key (public by design; RLS protects data)

## Run / deploy
Serve this folder from any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages),
or locally: `npx serve .` then open `/` and `/admin.html`.

## Make yourself an admin
1. Supabase Dashboard > Authentication > Users > create a user (email + password).
2. Run in the SQL editor:
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_EMAIL';
```
3. Sign in at `/admin.html`.

## Database
Existing, untouched: `events` (11 programs), `admin_users`.
Added by migration `kalolsavam_venues_participants_announcements`:
`venues` (v1-v4, placeholder names "Venue 1-4": rename in admin), `participants` (18),
`event_participants` (23 links), `announcements`, `event_results` (rank 1-3 + grade per program). All have RLS: public read, admin-only write,
and all are in the `supabase_realtime` publication.

# Vouched

A profile written entirely by the people who know you. Friends, coworkers, clients and roommates vouch for you, you approve what shows, and you share one link anywhere a stranger needs to trust you.

This repo has everything:

| Folder | What it is |
|---|---|
| `apps/web` | The website **and** the web app (Next.js). Landing page, safety/privacy/terms pages, login, profiles, inbox, settings. Works on phones and installs to the home screen. |
| `apps/mobile` | The iPhone and Android app (Expo / React Native). Same accounts and data as the website. |
| `packages/shared` | Rules and lists both apps share (traits, relationships, validation, Trusted badge math). |
| `supabase/migrations` | The database: tables, security rules, photo storage, and triggers. |

## Features

- **Accounts:** email + password (with reset), phone number codes, Google, Apple
- **Onboarding:** name, username (live availability check), headline, city, photo, profile color, page style
- **Page styles:** Signed, Sticker Pop, Night Shift, Work Badge — each person picks how their public page looks
- **Public profile** at `yoursite.com/username` with trust stats, top traits, filter by relationship, link-preview image for texts and bios
- **Write a vouch:** relationship, how long, up to 3 traits, 20–280 characters, signed with your name; edit or delete later
- **Inbox:** approve, hide, block, report; activity for new vouches, follows, co-signs, replies and recommendations; live badge
- **Ask:** pre-written text message, share sheet, copy link
- **Feed:** who vouched for whom and recommendation asks, from people you follow or everyone
- **Follow** people, with follower / following / vouches-given counts and a "You vouched for each other" mark
- **Co-sign:** back up someone else's vouch with one tap if you know the person too
- **Thank-you replies:** answer a vouch on your page with a short note
- **Ask for a rec:** post "need a good mechanic in Greenwood" and people answer with real Vouched profiles, grouped by who got recommended most
- **Discover:** search by name, skill or city; most-vouched near you; open asks
- **Profile tabs:** Vouches, Given, and About (bio, skills, top traits, badges, city, join date)
- **Rich profiles:** cover pattern, pronouns, bio, status ("Available for work", "Hiring", …), up to 8 skills, a pinned favorite vouch
- **Linked accounts:** Instagram, TikTok, LinkedIn, X, YouTube, Facebook and a website (up to 6)
- **Badges:** First vouch, Trusted, Generous, Connector, Backed up, Phone verified
- **Request a vouch** from a specific person; they get a notification with a one-tap Vouch button
- **Share sheet** with a QR code for your page
- **Settings hub:** edit profile, linked accounts, who can vouch (everyone / people I follow / paused), show in Discover, show follower counts, allow co-signs, notification preferences, light/dark/system theme, accent color, blocked people, account and delete
- **Real-app layout:** bottom tabs with a center Create button on phones, a sidebar on tablets and desktop, and a suggestions panel on wide screens
- **Trusted badge:** 10 vouches from 3+ parts of your life (family counts half)
- **Phone verified** mark on profiles
- **Settings:** edit everything, profile color themes, pause new vouches, change email/password, verify phone, blocked list, log out, delete account
- **Safety:** positive-only rules, reports, blocks, 20-vouches-a-day limit, nobody can vouch for themselves, database security on every table
- Light and dark mode everywhere

---

## Launch checklist

You need three free accounts: **Supabase** (database + logins), **Vercel** (hosts the website), **Expo** (builds the phone apps). Budget about an hour the first time.

### 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, then paste and run `supabase/migrations/0001_init.sql`, then `0002_profile_styles.sql`, `0003_social.sql`, and `0004_profile_plus.sql`, in that order.
3. **Authentication → URL Configuration**
   - Site URL: your website (e.g. `https://getvouched.app`)
   - Redirect URLs, add all of:
     - `https://YOUR-DOMAIN.com/auth/callback`
     - `http://localhost:3000/auth/callback`
     - `vouched://auth-callback`
     - `exp://**` (for testing the phone app in Expo Go)
4. **Authentication → Providers**
   - **Email:** on (leave "Confirm email" on).
   - **Phone:** turn on and connect **Twilio** (or MessageBird/Vonage). Twilio texts cost about 1¢ each. Without this, phone login and phone verification show an error.
   - **Google:** create an OAuth client in Google Cloud Console (Web application). Paste the Client ID and Secret. Add Supabase's callback URL (shown on that screen) as an authorized redirect URI in Google.
   - **Apple:** needs an Apple Developer account ($99/yr). Create a Services ID for web and enable Sign in with Apple for the app's bundle ID `app.vouched.ios`. Paste the details into Supabase. Add the bundle ID to "Authorized Client IDs" so the native iPhone button works.
5. **Project Settings → API:** copy the Project URL and the `anon` key.

### 2. Website — Vercel

```bash
cp apps/web/.env.example apps/web/.env.local   # fill in the Supabase URL, anon key, and site URL
npm install
npm run dev                                    # http://localhost:3000
```

To go live:
1. Push this repo to GitHub, then **Import** it at [vercel.com](https://vercel.com).
2. Set **Root Directory** to `apps/web`.
3. Add the three variables from `.env.example` (use your real domain for `NEXT_PUBLIC_SITE_URL`).
4. Deploy, then add your domain under **Settings → Domains**.

### 3. Phone apps — Expo

```bash
cd apps/mobile
cp .env.example .env        # same Supabase values + your website URL
npm install
npx expo start              # scan the QR code with Expo Go to try it
```

Before building for the stores:
- In `app.json`, replace `YOUR-DOMAIN.com` with your domain and change `bundleIdentifier` / `package` if you like.
- Native Apple and Google sign-in, plus photo picking, need a real build (not Expo Go):

```bash
npm install -g eas-cli
eas login
eas build --platform ios       # needs the Apple Developer account
eas build --platform android   # needs a Google Play account ($25 one time)
eas submit
```

**Links that open the app:** so `yourdomain.com/username` opens the app when installed, host Apple's `apple-app-site-association` and Android's `assetlinks.json` under `apps/web/public/.well-known/`. Expo's "Universal links" guide has the exact contents.

---

## Before you open it to the public

- **Privacy and Terms** pages are templates (`apps/web/app/privacy`, `apps/web/app/terms`). Fill in the `[DATE]` and `[CONTACT EMAIL]` placeholders and have a lawyer review them.
- **Reports** land in the `reports` table. Check them in Supabase → Table Editor, and delete vouches or accounts that break the rules.
- **Email sending:** Supabase's built-in email is rate limited. Connect a real sender (Resend, Postmark, SendGrid) under Authentication → SMTP before launch.
- **Costs at the start:** Supabase, Vercel and Expo are free at low volume. Texts (~1¢ each), Apple ($99/yr), Google Play ($25 once), and a domain (~$12/yr) are the real costs.

## How the trust rules work

- Approved vouches are public. Pending and hidden ones are visible only to the two people involved (enforced by the database, not just the app).
- Only the person a vouch is about can approve or hide it. Editing a vouch sends it back for approval.
- Blocked people can't vouch for you. Profiles can pause new vouches.
- One vouch per person per profile, 20 vouches per day per writer, no vouching for yourself.
- The "Phone verified" mark comes straight from Supabase Auth; people can't set it themselves.

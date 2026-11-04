# Google Play listing kit — Vouched

Everything Play Console asks for, ready to copy and paste. Replace `YOUR-DOMAIN.com` with your real domain everywhere.

## Files in this folder

| Play Console field | File | Size |
|---|---|---|
| App icon | `play-icon-512.png` | 512 × 512 PNG |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 PNG |
| Phone screenshots (upload in this order) | `screenshots/screenshot-1-profile.png` … `screenshot-6-discover.png` | 1080 × 1920 PNG |

The app's own icon, adaptive icon and splash screen are already in `apps/mobile/assets` and wired into `app.json`.

---

## Main store listing

**App name** (30 max)
```
Vouched: Put Your Name On It
```

**Short description** (80 max)
```
Invite-only. 3 vouches a month. See how you're connected to anyone you meet.
```

**Full description** (4000 max)
```
Vouched is the social network where every connection is backed by someone real.

You can't write your own Vouched page. The people who know you do — friends, coworkers, clients, roommates and neighbors. And because vouches are scarce, every one of them means something.

HOW IT WORKS

• Invite-only. Every member is vouched in by someone who already belongs. Your page shows who vouched you in.
• Three vouches a month. Save them for people you'd really stand behind.
• Your name is on the line. If someone you backed is removed for scams or a fake account, your vouches count for less. Back good people and your word carries more.
• See how you're connected. Look anyone up and see the chain of real vouches between you, like You → Dana → Marcus — before a date, a hire, or a new roommate.
• Daily props. Quick questions like "Who would you call at 2am if your car broke down?" Tap a friend. It's anonymous, and it shows up on their page.

MORE TO DO

• Ask your people for a rec — a mechanic, a sitter, a stylist — and get answers with real Vouched pages
• Co-sign a vouch when you know the person too
• Reply with a thank-you on your own page
• Follow people and see who's vouching for whom
• Make your page yours: colors, covers, four page styles, links to Instagram, TikTok, LinkedIn and more
• Share your page with a link or QR code

YOU'RE IN CONTROL

• Nothing shows on your page until you approve it
• Vouches are positive only
• Hide, block or report anything
• Choose who can vouch for you
• Delete your account any time, right in the app

Vouched is free. For adults 18 and older.
```

**App category:** Social
**Tags (pick up to 5):** Social networking, Community, Friends, Recommendations, Local
**Contact email:** your support address (same as `NEXT_PUBLIC_CONTACT_EMAIL`)
**Website:** `https://YOUR-DOMAIN.com`
**Privacy policy URL:** `https://YOUR-DOMAIN.com/privacy`

---

## App content (Policy → App content)

**Privacy policy:** `https://YOUR-DOMAIN.com/privacy`

**Ads:** No, my app does not contain ads.

**App access:** All or some functionality is restricted → add instructions:
```
Vouched is invite-only. Use this reviewer account, which already has a profile:
Email: reviewer@YOUR-DOMAIN.com
Password: (the password you set)
Log in with "Email" on the first screen.
```
→ Create that account before you submit (see "Reviewer account" below).

**Content rating** (IARC questionnaire)
- Category: Social or communication
- Violence, sexual content, profanity, drugs, gambling: No to all
- Do users interact or exchange content? **Yes**
- Can users share their physical location with other users? **No** (city is typed text, not GPS)
- Does the app let users buy digital goods? **No**
- Expected result: around Teen / 12+ with "Users Interact"

**Target audience:** 18 and over only. Does the app appeal to children? **No**.

**News app:** No. **Government app:** No. **Financial features:** None. **Health features:** None.
**Data safety:** see below.

### Data safety form

Does your app collect or share any of the required user data types? **Yes**
Is all user data encrypted in transit? **Yes**
Do you provide a way for users to request that their data be deleted? **Yes** → `https://YOUR-DOMAIN.com/delete-account`

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | Optional (if they use email login) | Account management, App functionality |
| Personal info → Phone number | Yes | No | Optional | Account management, Fraud prevention / security |
| Personal info → User IDs | Yes | No | Required | Account management, App functionality |
| Personal info → Other info (city, pronouns, bio, invite contacts they type in) | Yes | No | Optional | App functionality |
| Photos and videos → Photos | Yes | No | Optional | App functionality (profile photo) |
| Messages → Other in-app messages (vouches, replies, asks, recommendations) | Yes | No | Required | App functionality |
| App activity → Other user-generated content (props, co-signs) | Yes | No | Optional | App functionality |
| App activity → Other actions (follows, blocks, reports) | Yes | No | Optional | App functionality, Fraud prevention / security |
| Device or other IDs (push notification token) | Yes | No | Optional (only if they allow notifications) | App functionality |
| App info and performance → Other (beta feedback they type, app version) | Yes | No | Optional | Analytics, App functionality |

Not collected: location (GPS), financial info, health, contacts list, calendar, audio, files, web browsing, crash logs, diagnostics.
"Shared" is **No** because Supabase (hosting) and the text-message provider are service providers acting for you, which Google doesn't count as sharing.

**Account deletion URL:** `https://YOUR-DOMAIN.com/delete-account`

---

## Reviewer account

Google's reviewers need to get past the invite gate. Before submitting:

1. Sign up on your website with `reviewer@YOUR-DOMAIN.com` using an invite code from your own account (`/invite`).
2. Finish setup (name "Play Reviewer", any username).
3. Optional: in Supabase SQL Editor give it a few vouches and follows so the app isn't empty.

---

## Release notes for version 1.0.0
```
Welcome to Vouched. Get vouched in, put your name on the people you'd stand behind, and see how you're connected to anyone.
```

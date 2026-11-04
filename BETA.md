# Vouched — first beta, step by step

Everything here can be done from a phone browser. Do the steps in order. Total time: about an hour, mostly waiting on builds.

---

## 1. Database — Supabase (15 min)

1. Go to **supabase.com** → sign in with GitHub → **New project**. Name it `vouched`, pick a strong database password, region **East US**.
2. Open **SQL Editor** → **New query**. Open each file in `supabase/migrations` on GitHub (keegieO/Vouched), copy it all, paste, **Run**. Do them in order:
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006`
3. **Let yourself in first** (Vouched is invite-only). Run:
   ```sql
   update app_config set value = 'off' where key = 'invite_only';
   ```
4. **Database → Extensions** → make sure **pg_net** is on (it powers push notifications).
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key. You'll paste these in steps 2 and 3.
6. **Authentication → URL Configuration**: set Site URL to your website address (step 2 gives you one).

## 2. Website — Vercel (10 min)

1. Go to **vercel.com** → sign in with GitHub → **Add New → Project** → import **keegieO/Vouched**.
2. **Root Directory:** `apps/web`.
3. **Environment Variables:**
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key from step 1 |
   | `NEXT_PUBLIC_SITE_URL` | `https://vouched-xxxx.vercel.app` (the address Vercel gives you, or your own domain later) |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | the email testers and Google can reach you at |
4. **Deploy.** Open the site, sign up, and set up your page.
5. **Make yourself admin.** In Supabase SQL Editor:
   ```sql
   insert into admins (user_id) select id from profiles where username = 'YOUR-USERNAME';
   ```
   Now **Settings → Admin** shows reports, feedback and stats.
6. Have your other founding testers sign up now too. Then **turn invite-only back on**:
   ```sql
   update app_config set value = 'on' where key = 'invite_only';
   ```
   From now on, everyone joins with an invite link from **+ → Vouch someone in**.

> The website works on every phone and can be added to the home screen. That alone is enough for a first beta while the Android app goes through Google.

## 3. Android app — Expo, built from GitHub (20 min + build time)

1. Go to **expo.dev** → sign up → **Create a project** named `vouched`. Copy the **Project ID** it shows.
2. Put the Project ID in the code: on GitHub open `apps/mobile/app.json`, tap the pencil, replace `REPLACE-WITH-YOUR-EAS-PROJECT-ID` with it, commit. (Or send it to Claude.)
3. In the Expo project: **Project settings → Environment variables → Add**, for environments **production** and **preview**:
   | Name | Value | Visibility |
   |---|---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | Project URL | Plain text |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon key | Plain text |
   | `EXPO_PUBLIC_SITE_URL` | your website address from step 2 | Plain text |
4. **Project settings → GitHub** → connect **keegieO/Vouched**, base directory **`apps/mobile`**.
5. **Builds → Build from GitHub** → platform **Android**, profile **production**, branch **main**. If it asks about a keystore, let Expo **generate** one (Expo keeps it safe — you need the same one for every update).
6. When it finishes, **download the `.aab`**. That's the file Google Play wants.
   - Want to try it on an Android phone first without Google? Run the same build with profile **preview**. That makes an `.apk` you can install directly.

If the app opens to "Vouched isn't connected yet", the environment variables in step 3.3 are missing — add them and build again.

## 4. Google Play — internal testing (15 min)

1. **play.google.com/console** → developer account (Personal, name e.g. *Odd Hours Studio*) → $25 → ID check.
2. **Verify an Android device:** borrow any Android 10+ phone for one minute, install **Play Console**, sign in, tap verify.
3. **Create app** → *Vouched: Put Your Name On It* → App → Free.
4. Fill **Store listing** and **App content** from `store/google-play/LISTING.md`. Images are in `store/google-play/`.
5. **Testing → Internal testing → Create release** → upload the `.aab` → add testers' Gmail addresses → **Start rollout**. Internal testing (up to 100 people) has no review wait.
6. For a public launch on a personal account, Google needs a **closed test with 12+ testers for 14 days** first. Move the same build to **Closed testing** when you're ready.

## 5. Push notifications on Android (optional for the first beta)

iPhone push works through Expo with no extra setup. Android needs Firebase:

1. **console.firebase.google.com** → Add project → add an **Android app** with package `app.vouched.android` → download **google-services.json**.
2. In Expo: **Environment variables → Add** → type **File**, name `GOOGLE_SERVICES_JSON`, upload the file.
3. In Firebase: **Project settings → Service accounts → Generate new private key**. In Expo: **Credentials → Android → FCM V1 service account key** → upload it.
4. Build again.

Without this, everything else works; Android testers just won't get lock-screen notifications.

---

## What's in this beta

- Invite-only joining, 3 vouches a month, track record, trust paths, daily props
- **Push notifications** for new vouches, props, follows, co-signs, replies, asks and invites
- **Share as story:** a 1080×1920 image of any vouch for Instagram/Snapchat stories
- **Send feedback** in Settings — it lands in Admin → Feedback
- **Admin** page: open reports (dismiss, hide/delete a vouch, remove a member), resolved reports, feedback, stats
- **Permanent removal record:** a removed scammer deleting their account no longer clears the mark from people who backed them
- "Scam or fraud" report reason

## Beta checklist for testers

Send testers this list and ask them to report anything weird with **Settings → Send feedback**:

- [ ] Join with an invite link and set up your page
- [ ] Play a round of props
- [ ] Vouch for 2 people you know (and see the 3-a-month counter go down)
- [ ] Approve a vouch someone wrote for you, then **Share as story**
- [ ] Invite one person
- [ ] Open someone's profile and check **How you're connected**
- [ ] Ask for a rec and answer someone else's
- [ ] Change your page style and color
- [ ] Turn on notifications and see if a props notification arrives

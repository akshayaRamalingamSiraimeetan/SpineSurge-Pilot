# Free demo deployment (no card) — step by step

Result: a public link (e.g. `https://spinesurge-demo.onrender.com`) where testers create their own
account (email code to their inbox) and work. Three free services, all sign-in-with-GitHub/Google,
no card:

| Part | Service | Free limits |
|---|---|---|
| App + link | **Render** free web service | sleeps after 15 min without visitors; next visit waits ~1 min |
| Database + uploaded files | **Supabase** free project | 500 MB database, 1 GB files (≤ 50 MB per file); pauses after 7 days unused (one click to restore) |
| Sign-up code emails | **Brevo** free | 300 emails/day |

Keep a text file open while you go — you'll collect 8 values for step C.

---

## A. Supabase — database and file storage (≈ 5 min)
1. Go to **supabase.com** → *Start your project* → sign in with GitHub.
2. **New project** → name `spinesurge-demo`, choose a **database password** (write it down),
   region **Mumbai** or **Singapore**, plan **Free** → *Create new project* (wait ~2 min).
3. **Database address** — click **Connect** (top bar) → tab *Connection string* → choose
   **Session pooler** → copy the URI. Replace `[YOUR-PASSWORD]` with your database password.
   → this is **`DATABASE_URL`**.
4. **Bucket** — left menu **Storage** → *New bucket* → name **`uploads`**, leave *Public bucket*
   **off** → *Create*.
5. **File access keys** — Storage → **Settings** (or *S3 Configuration*):
   - make sure *S3 connection* is enabled,
   - copy **Endpoint** → **`S3_ENDPOINT`**, **Region** → **`S3_REGION`**,
   - *New access key* → copy **Access key ID** → **`S3_ACCESS_KEY_ID`** and
     **Secret access key** → **`S3_SECRET_ACCESS_KEY`** (shown only once).

## B. Brevo — emails with the sign-up code (≈ 5 min)
1. Go to **brevo.com** → *Sign up free* (Google sign-in works) → finish the short profile.
2. **Sender**: top-right menu → *Senders, domains & dedicated IPs* → *Senders* → *Add a sender* →
   name `SpineSurge`, email = your Gmail → open the confirmation email Brevo sends and confirm.
   → **`EMAIL_FROM`** = `SpineSurge <your-gmail@gmail.com>`
3. **API key**: top-right menu → *SMTP & API* → tab *API keys* → *Generate a new API key* →
   copy it → **`BREVO_API_KEY`**.

(Tell testers to check *Spam/Promotions* if the code doesn't arrive within a minute.)

## C. Render — the app and the link (≈ 15 min, mostly waiting)
1. Go to **render.com** → *Get Started* → sign in with **GitHub** → allow access to the
   `SpineSurge-Pilot` repository.
2. **New +** → **Blueprint** → pick `SpineSurge-Pilot` → branch **`demo-deploy`** → Render reads
   `render.yaml` and asks for the values:
   `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
   `BREVO_API_KEY`, `EMAIL_FROM`, and **`PLATFORM_ADMIN_EMAILS`** = the email you will sign up with
   (you'll see the Usage page). → **Apply**.
3. Wait for the first build (10–15 min). In the service's **Logs** you should see:
   `Applied 15 migration(s)` · `[storage] uploads → S3 bucket "uploads"` · `Server running`.
   (If you see `[email] ... using mock`, the Brevo values are missing.)
4. The link is at the top of the service page (`https://spinesurge-demo….onrender.com`).
   Open it → **Create Account** with your `PLATFORM_ADMIN_EMAILS` address → enter the emailed code →
   complete your profile. The sidebar now has **Usage**.
5. Send the link to your testers (+ `docs/DEMO_GUIDE.md`).

If Render ever asks for a card for the free plan, stop and tell Claude — the same app also runs on a
free Hugging Face Space (no card) with the same values.

## Updating later
Every push to the `demo-deploy` branch redeploys automatically. Data (database + files) lives in
Supabase, so redeploys and sleeping never lose anything.

## Limits & what to tell testers
- First open after a quiet spell takes about a minute (the free server wakes up).
- Use mostly X-rays and only a few small CT series — 1 GB file storage in total.
- If nobody uses it for 7 days, Supabase pauses the project: Supabase dashboard → *Restore*.
- Moving to an always-on paid plan later needs no code changes (docs/DEPLOYMENT.md).

# Wedding RSVP

A self-hosted wedding website and RSVP system for Andrew & Madeline, 29 May 2027.

Two applications, one database:

| | | |
|---|---|---|
| **Guest site** | `andrew-madeline-rsvp.duckdns.org` | The public wedding website, plus a private RSVP reachable by a unique link per household |
| **Admin** | `andrew-madeline-rsvp-admin.duckdns.org` | Guest list, RSVPs, invitations, address labels, reminder emails, website content, analytics and backups |

They run as separate containers and share exactly one thing: a SQLite file on a Docker
volume. Nothing else crosses between them, so a problem on the public site cannot reach
the admin panel.

---

## Quick start

```bash
git clone <your-repo> weddingRSVP && cd weddingRSVP

cp .env.example .env          # then edit it -- ADMIN_PASSWORD at minimum
npm run set-domain andrew-madeline-rsvp.duckdns.org andrew-madeline-rsvp-admin.duckdns.org

# Both names must resolve to this server. On DuckDNS each domain is one label, so
# these are TWO domains in the same account, not a domain and a subdomain:
#   andrew-madeline-rsvp.duckdns.org
#   andrew-madeline-rsvp-admin.duckdns.org

./scripts/init-letsencrypt.sh andrew-madeline-rsvp.duckdns.org you@example.com
docker compose up -d
```

Then open the admin panel, sign in, and add a guest. Everything else -- the site's
words, the invitations, the reminders -- is editable from there.

### Development

```bash
npm install
npm run dev -w app -- --port 5175      # guest site
npm run dev -w admin -- --port 5176    # admin
npm run dev:all                        # both, on 5173/5174
npm run seed         # fill a dev database with a plausible guest list

npm test             # unit tests
npm run test:e2e     # end-to-end, against real production builds
npm run check        # type-check both apps
```

`npm install` will ask you to approve install scripts the first time (npm blocks them by
default now). `better-sqlite3` and `esbuild` are already listed under `allowScripts` in
`package.json`; if npm still prompts, run `npm approve-scripts better-sqlite3 esbuild`.

> The default dev ports are 5173 and 5174, which are also Vite's own defaults -- the
> pictureQR project sits on them, so the commands above use 5175/5176. Whatever you
> pick has to match `PUBLIC_SITE_URL` and `PUBLIC_ADMIN_URL` in `.env`, or the CSRF
> origin check rejects every form.

---

## How it fits together

```
guest browser ──┐
                ├──► nginx (TLS, security headers) ──┬──► app    (SvelteKit, port 3000)
admin browser ──┘                                    └──► admin  (SvelteKit, port 3000)
                                                              │
                                                     db-data volume
                                                     wedding-rsvp.db
```

| Directory | What lives there |
|---|---|
| `app/` | The guest site: wedding website and RSVP |
| `admin/` | The admin dashboard |
| `shared/` | Everything both apps need: the SQLite layer, tokens, CSRF, sessions, rate limiting, CSV, email, QR codes, PDF generation, backups |
| `nginx/` | Reverse proxy, TLS and the security headers |
| `scripts/` | Deployment and maintenance CLI |

`shared/` is compiled into each app at build time through the `$shared` alias rather
than published as a package, so there is no version skew between the two.

### Why SQLite

One file holds the guest list, the RSVPs, the site's content and its photos. That makes
a backup a single file copy, and it means there is no database container to run, secure
or upgrade. WAL mode lets the guest app keep reading while the admin app writes.

The one thing this shape makes harder is *restoring* a backup, because both containers
have the file open at once. See `shared/src/backup.ts` -- a restore copies rows in
inside a transaction rather than swapping the file, so the other container never sees a
half-restored database and needs no restart.

---

## The guest site

Everything except the RSVP form renders on the server and works with JavaScript
disabled -- the navigation, the FAQ accordion, even the countdown (it renders the real
remaining time and simply stops ticking). The RSVP form is a plain `<form>` posting to a
form action; `use:enhance` only removes the page reload.

Dark mode follows the visitor's system setting. It is a swap of CSS custom properties,
so there is no toggle to hunt for and no flash of the wrong theme on first paint.

**Pages:** home (with the split-flap countdown), Our Story, Event Details, Wedding Party,
Photos, Registry, FAQ. Any of them can be switched off from the admin panel, which
removes it from the navigation and makes its URL a 404.

### RSVP

Each household gets a URL containing a 32-character random token -- 192 bits of
entropy, so the guest list cannot be walked by guessing. The token is the only
credential; there is no guest login.

- **`/rsvp/<token>`** -- that household's form, pre-filled with their previous answer if
  they have already replied. They can change it until the deadline.

  It is built for a phone, because that is what everyone replies on. The page carries no
  site navigation or footer and fits **one screen with no scrolling** on a Pixel 5, with
  the submit button always in reach. Guests answer one question -- *how many of you are
  coming?* -- with stepper buttons rather than a number field, so the keyboard never
  opens over the button. The household-versus-plus-one split is derived against the
  invited party size rather than asked for: nobody invited as a party of four can be
  expected to know whether that is "4 and 0" or "3 and 1". The confirmation offers a
  calendar file and a quiet way to change the reply.
- **`/rsvp`** -- "find my invitation", for anyone who lost their link, and where the
  universal QR code points. It searches by name and never renders a token: an exact
  match becomes a redirect, and an ambiguous one shows names to pick from.

The deadline is **soft**. Guests are turned away after it passes and shown how to reach
you; the admin can still record a reply for anyone who gets in touch.

---

## The admin panel

Sign in with `ADMIN_PASSWORD`. There is one account, because there are two of you.

| Screen | What it does |
|---|---|
| Dashboard | Head counts, response rate, recent activity, per-batch and per-reminder breakdowns |
| Guests | Search, filter, sort, edit, bulk actions; CSV import with column mapping |
| RSVPs | Record or amend a reply on someone's behalf -- for phone calls and late responses |
| Invitations | Live preview, every line and colour editable; print-ready PDFs, per-guest ZIP, or QR PNGs |
| Labels | Avery 5160 / 5162 / 5163 / 5164 sheets from the stored addresses |
| QR codes | Per household and one universal code, as PNG or SVG |
| Emails | Template editor with merge fields and a live preview; send to everyone still pending |
| Website | Every word and photo, plus accent colour, fonts, hero style and section order |
| Analytics | Response rate over time, status breakdown, daily activity, reminder effectiveness |
| Activity | A timestamped audit log of everything that has happened |
| Backups | Daily automatic snapshots, manual backup, download and restore |
| Settings | Names, dates, venue, deadline, card size, backup retention, and Gmail |

### CSV import

Upload any spreadsheet export. The importer parses real CSV -- quoted commas, doubled
quotes, embedded newlines, Excel's BOM -- guesses which column is which from the header
wording, and shows you the mapping and every problem row before writing anything. The
whole import runs in one transaction.

Existing households can be skipped or updated; either way their **RSVP link is never
changed**, so an invitation already in the post keeps working.

### Reminder emails

Gmail is configured in the admin panel under **Settings → Email** — an address, a
sender name, and a Google *app password* (not your account password). Nothing needs a
restart, and the password is encrypted at rest with a key derived from
`ADMIN_PASSWORD`, so a backup file on its own does not hand over the ability to send
mail as you. It is never sent back to the browser, which is why the field looks empty
even once one is saved. Rotating `ADMIN_PASSWORD` makes it unreadable by design; the
screen says so and asks for it again.

`GMAIL_USER` / `GMAIL_APP_PASSWORD` in `.env` still work as a fallback if you would
rather keep the credential out of the database. Templates support
`{{household_name}}`, `{{rsvp_link}}`, `{{wedding_date}}`, `{{venue}}`, `{{deadline}}`
and `{{couple_names}}`. Sends are paced to stay inside Gmail's limits, and every attempt
-- including the failures -- is recorded, so a bounce is visible rather than assumed
delivered.

Leaving Gmail unconfigured is fine; the screen says so and nothing else breaks.

### Invitations

The preview and the PDF are drawn from **one layout module**: the same list of draw
operations, rendered by pdf-lib for print and as SVG for the screen. A preview built
separately in HTML drifts from the print the moment either side changes, and the drift
is only ever discovered after something has been printed.

Every line is editable -- the eyebrow, the names, the invite line, the date, the time,
the venue, the QR caption -- along with the lettering, an accent colour, and whether the
border, the QR code and the printed fallback link appear at all. A **for a print shop**
toggle adds 0.125in bleed and crop marks; leave it off for printing at home.

The invitation inherits its venue, date and time from Settings and the Event Details
page until a line is deliberately written on the card, so "the venue" has one home rather
than three. An invitation says "Four in the afternoon" where a website says "4:00 pm",
which is why the override exists.

### Photos

Images are stored in the database as BLOBs, so one backup covers the whole site and
there is no uploads volume to keep in step between the two containers.

Uploads are downscaled in the browser before they are sent -- a photo off a phone is
routinely 4000px and several megabytes, against an 8MB server cap, and nothing on the
site is displayed wider than about 1600px. Re-encoding also strips EXIF, which quietly
removes the GPS coordinates of wherever the photo was taken. What reaches the server is
still validated by its magic bytes, not by what the browser called it.

### Backups

The admin container takes a snapshot a minute after it starts and every 24 hours after
that, keeping `BACKUP_RETENTION_DAYS` of them. Snapshots use SQLite's `VACUUM INTO`, so
they are consistent even though they are taken while the site is live.

Both volumes are on the same disk, so **copy them off the machine periodically** -- a
backup beside the original survives a mistake, not a dead disk.

```bash
docker compose exec admin node /repo/scripts/backup.js   # a snapshot right now
docker cp wedding-rsvp-admin:/backups ./backups-copy     # take them elsewhere
```

---

## Security

| | |
|---|---|
| Guest authentication | A 192-bit random token per household, and nothing else |
| Admin authentication | One password, HMAC-signed session cookie, 30-minute idle timeout |
| Login rate limit | 5 attempts per 15 minutes per IP |
| RSVP rate limit | 20 submissions per minute per IP; name look-up is tighter still |
| CSRF | Signed double-submit token in a hidden field, plus Origin and Referer checks, on every state-changing request in both apps |
| Bots | A honeypot field; tripping it answers as though it worked and stores nothing |
| SQL | Every query is a prepared statement with bound parameters. Dynamic `ORDER BY` and filters are chosen from fixed maps, never built from request data |
| Uploads | Images are validated by their magic bytes, not their filename or declared type |
| Headers | HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` -- set by nginx and again by each app, so they hold even if the app is reached directly |
| Third parties | None. No CDN, no font host, no analytics; the CSP admits no external origin |
| Tokens in URLs | RSVP pages are `no-store` and `noindex`, and their paths are never logged |

The admin panel runs in its own container on its own subdomain. It shares the database
volume with the guest app and nothing else.

---

## Testing

```bash
npm test           # 198 unit tests
npm run test:e2e   # 90 end-to-end tests, against real production builds
```

The E2E suites boot the same `adapter-node` server the containers run, against a
throwaway SQLite file, and drive it with Chromium -- desktop and Pixel 5 viewports for
the guest site. They assert on the database, not just on the screen: a confirmation page
saying "thank you" looks identical whether or not anything was stored.

Covered end to end: the whole RSVP flow including updates and declines, the no-JavaScript
path, the name look-up and its disambiguation, unknown and malformed tokens, the honeypot,
CSRF and cross-origin rejection, the closed deadline, admin login and its rate limit,
guest CRUD, CSV import, PDF and CSV generation, the content editor, backups and restore.

---

## Configuration

Everything is in `.env` -- see `.env.example`, which documents each value. The ones you
must set:

```ini
ADMIN_PASSWORD=...
PUBLIC_SITE_URL=https://andrew-madeline-rsvp.duckdns.org
PUBLIC_ADMIN_URL=https://andrew-madeline-rsvp-admin.duckdns.org
```

Both hostnames must exist. On DuckDNS each domain is a single label, so the admin name
is a **second domain registered in the same account**, not a subdomain of the first —
one certificate covers the pair, so a missing name fails the whole request.
`scripts/init-letsencrypt.sh` checks this before spending a rate-limit attempt.

The wedding's own details -- names, dates, venue, deadline -- can be set in `.env` or
edited in **Settings**, where they take effect immediately with no restart. A stored
setting wins over the environment.

### Renewing TLS

Nothing to do. The certbot container renews twice a day and nginx reloads every twelve
hours to pick up the new certificate. `scripts/init-letsencrypt.sh` is run once, ever.

---

## Deliberately not built

- **Scheduled sends.** Reminders go out when you press the button. Scheduling would mean
  a job runner and a queue to keep alive between now and the wedding.
- **Cropping.** Uploads are downscaled, not cropped. The layouts use `object-cover`, so
  a photo of any shape fills its frame without one.
- **Charts as images.** The analytics data exports as CSV, and every chart has a table
  view behind it; rendering the SVGs to PNG server-side would mean a headless browser.
- **Meal choices, dietary notes, song requests, seating, travel and accommodation.**
  Out of scope by design -- the RSVP asks whether you are coming and how many of you.
- **Confirmation emails to guests.** Only the admin sends mail. A guest's confirmation is
  the page they see, and they can revisit their link at any time to check it.

## Two containers, one database

The guest app and the admin app open the same file at the same time. Three things make
that safe, and each is worth knowing before changing anything in `shared/src/db/`:

- **WAL mode**, so a write in the admin app does not block a guest mid-RSVP.
- **`busy_timeout`**, so a writer waits for the other process's lock instead of failing.
- **No caching of database reads in either app.** They are indexed lookups over a few
  hundred rows; caching them would only mean serving content the other container has
  already changed.

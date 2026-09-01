# `@rsvp/shared`

Everything both applications need. It is compiled into each app at build time through
the `$shared` alias rather than published as a package, so the guest site and the admin
panel can never be running different versions of the same logic.

## What is in here

| Module | |
|---|---|
| `db/` | The SQLite layer: connection and pragmas, the migration list, and a module per table. Every query is a prepared statement with bound parameters |
| `rsvp-service.ts` | The rules that decide whether an RSVP is accepted, shared by the guest form and the admin's manual entry so the two cannot disagree |
| `config.ts` | Environment variables, read on demand so a container restart is enough to pick up an edit |
| `csrf.ts` / `csrf-fields.ts` | Signed double-submit tokens, plus Origin and Referer checks |
| `session.ts` | The admin's HMAC-signed session cookie |
| `rate-limiter.ts` | Per-IP fixed-window budgets |
| `tokens.ts` | Household RSVP tokens, and the one place a token becomes a URL |
| `sanitize.ts` | Input normalisation, strict integer parsing, URL and HTML allow-lists |
| `csv.ts` | An RFC 4180 parser, column-mapping guesses, and injection-safe export |
| `email-template.ts` / `mailer.ts` | Merge fields, and paced Gmail SMTP delivery |
| `qr.ts` / `invitations.ts` / `labels.ts` | QR codes, invitation cards and Avery label sheets, all as PDFs from pure JavaScript |
| `zip.ts` / `crc32.ts` | A store-only ZIP writer, so batch downloads need no compression library |
| `backup.ts` | `VACUUM INTO` snapshots, retention, and an in-place restore |
| `format.ts` | Date, countdown and number formatting -- deliberately free of Node imports, so components can use it |
| `defaults.ts` | What the guest site says before anyone has edited a word of it |

## Two rules worth knowing

**Nothing here may import `node:*` if a Svelte component needs it.** A component that
imports a server module drags that module's dependencies into the browser bundle, and
the build fails on `node:crypto` or `node:fs`. That is why `csrf-fields.ts` exists
apart from `csrf.ts`, and why `formatBytes` lives in `format.ts` rather than beside the
backup code.

**Never edit an existing migration.** A deployment has already run the old text, so
changing it would silently diverge the couple's live database from a fresh one. Append
a new entry to `MIGRATIONS` instead.

## Tests

The unit tests live in `app/tests/unit/`, because that is where the test runner is
configured. They cover this package, not the app.

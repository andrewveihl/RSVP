# Every response header the guest site sends.
#
# It is a whole file rather than "the shared ones plus a couple more" because nginx's
# add_header does not inherit into any block that declares an add_header of its own --
# so a `location` that adds one header silently drops all of these. Including this file
# wherever headers are set is what keeps that from happening quietly.
#
# `always` so they are sent on error responses too, not just 2xx.

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

# No third-party origin appears anywhere on the guest site, so nothing needs to be
# allow-listed. `data:` covers the QR code inlined on the RSVP page.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'" always;

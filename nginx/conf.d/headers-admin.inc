# Every response header the admin app sends. See headers-guest.inc for why this is a
# complete set rather than a supplement.

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

# `blob:` for images, because generated QR previews are handed to the page as object
# URLs rather than round-tripped through the server.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'" always;

# Nothing in the admin panel should ever be cached by an intermediary, or indexed.
add_header Cache-Control "no-store" always;
add_header X-Robots-Tag "noindex, nofollow, noarchive" always;

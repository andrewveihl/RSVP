#!/bin/sh
# =============================================================================
# One-time TLS bootstrap.
#
# There is a chicken-and-egg problem on a fresh server: nginx will not start
# without a certificate, and certbot's HTTP-01 challenge needs nginx running to
# serve the challenge file. This script breaks the loop by planting a temporary
# self-signed certificate, starting nginx, swapping in a real Let's Encrypt
# certificate, and reloading.
#
# Run it once, before the first `docker compose up -d`:
#
#     ./scripts/init-letsencrypt.sh rsvp.example.duckdns.org you@example.com
#
# One certificate is issued covering BOTH hostnames, because nginx serves them from the
# same file. The admin name is taken from that file -- whatever `npm run set-domain` put
# there -- so the two cannot drift apart; ADMIN_DOMAIN overrides it. It is a sibling
# label rather than a sub-subdomain (`admin.rsvp.example.org`) because DuckDNS hands
# out one label, and a wildcard certificate would need a DNS-01 challenge.
#
# Afterwards the certbot container renews automatically; you never run this again.
# =============================================================================
set -eu

# The script lives in scripts/, but every docker compose command below needs the repo
# root -- that is where docker-compose.yml and the ./certbot bind mounts are.
cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
EMAIL="${2:-}"

# The admin app hostname, read from the nginx config rather than assumed.
#
# That file is what actually gets served, and a certificate for a name nginx does not
# answer to is worthless -- so the two must agree. `npm run set-domain` writes it; this
# reads the second name off the HTTP block's server_name line. ADMIN_DOMAIN overrides,
# and the admin-<domain> convention is the last resort.
nginx_server_names() {
	sed -n 's/^[[:space:]]*server_name[[:space:]]\{1,\}\([^;]*\);.*/\1/p' \
		nginx/conf.d/default.conf | head -n 1
}
ADMIN_DOMAIN="${ADMIN_DOMAIN:-$(nginx_server_names | awk '{ print $2 }')}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin-${DOMAIN}}"
# Set STAGING=1 to use Let's Encrypt's staging CA while testing. Its rate limits
# are far more forgiving, and getting locked out the week of a wedding is bad.
STAGING="${STAGING:-0}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
	echo "Usage: $0 <domain> <email>            (e.g. $0 rsvp.example.duckdns.org you@example.com)" >&2
	echo "" >&2
	echo "Both <domain> and the admin hostname must already resolve to this server." >&2
	exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
	echo "docker compose is required but was not found." >&2
	exit 1
fi

# The certificate must cover the names nginx serves, or browsers reject it even though
# issuance succeeded. Catch the mismatch here rather than after a rate-limited request.
NGINX_DOMAIN="$(nginx_server_names | awk '{ print $1 }')"
if [ -n "$NGINX_DOMAIN" ] && [ "$NGINX_DOMAIN" != "$DOMAIN" ]; then
	echo "nginx is configured for '$NGINX_DOMAIN', but you asked for '$DOMAIN'." >&2
	echo "" >&2
	echo "A certificate for a name nginx does not answer to would not help. Point the" >&2
	echo "config at these hostnames first:" >&2
	echo "" >&2
	echo "    npm run set-domain $DOMAIN $ADMIN_DOMAIN" >&2
	exit 1
fi

# --- Check DNS before spending a rate-limit attempt -------------------------
#
# One certificate covers both names, so a single unresolved name fails the whole
# request -- and certbot reports it as a challenge failure, which reads like a
# firewall problem and is not one. Let's Encrypt also rate-limits failures, so it is
# worth being certain before asking.
#
# On DuckDNS the admin name is a SEPARATE domain, not a subdomain: each DuckDNS
# domain is one label. Register both in the same account and point them at this host.
resolves() {
	if command -v getent >/dev/null 2>&1; then
		getent hosts "$1" >/dev/null 2>&1 && return 0
	fi
	if command -v host >/dev/null 2>&1; then
		host "$1" >/dev/null 2>&1 && return 0
	fi
	if command -v nslookup >/dev/null 2>&1; then
		nslookup "$1" >/dev/null 2>&1 && return 0
	fi
	# No resolver tool available -- do not block the run on a check we cannot make.
	return 0
}

MISSING=""
for name in "$DOMAIN" "$ADMIN_DOMAIN"; do
	resolves "$name" || MISSING="$MISSING $name"
done

if [ -n "$MISSING" ]; then
	echo "" >&2
	echo "These names do not resolve yet:$MISSING" >&2
	echo "" >&2
	echo "Both must point at this server before a certificate can be issued -- one" >&2
	echo "certificate covers the pair, so a single missing name fails the whole request." >&2
	echo "" >&2
	echo "On DuckDNS each domain is a single label, so '$ADMIN_DOMAIN'" >&2
	echo "is a second domain to register in the same account, not a subdomain of the first." >&2
	echo "" >&2
	echo "Re-run this once both resolve. Set SKIP_DNS_CHECK=1 to proceed anyway." >&2
	[ "${SKIP_DNS_CHECK:-0}" = "1" ] || exit 1
fi

CERT_PATH="./certbot/conf/live/$DOMAIN"

if [ -d "$CERT_PATH" ]; then
	printf 'A certificate for %s already exists. Replace it? [y/N] ' "$DOMAIN"
	read -r reply
	case "$reply" in
		[yY]*) ;;
		*) echo "Leaving the existing certificate alone."; exit 0 ;;
	esac
fi

echo "==> Preparing directories"
mkdir -p ./certbot/conf ./certbot/www

echo "==> Writing TLS parameters"
# Written here rather than downloaded from certbot's repository: those URLs have moved
# more than once (and 404 as of this writing), and a deployment should not depend on
# GitHub being reachable.
#
# Deliberately narrower than certbot's stock file, which also sets ssl_session_cache,
# ssl_session_timeout and ssl_session_tickets. nginx/conf.d/default.conf already sets
# those per server block, and nginx rejects a duplicate directive in the same context --
# so including the stock file would stop nginx from starting at all.
if [ ! -e "./certbot/conf/options-ssl-nginx.conf" ]; then
	cat > ./certbot/conf/options-ssl-nginx.conf <<'TLSCONF'
# Managed by init-letsencrypt.sh -- protocol and cipher selection only.
# Session settings live in nginx/conf.d/default.conf; do not duplicate them here.

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
TLSCONF
fi

if [ ! -e "./certbot/conf/ssl-dhparams.pem" ]; then
	echo "    Generating Diffie-Hellman parameters (takes a minute)"
	docker compose run --rm --entrypoint "\
		openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048" certbot
fi

echo "==> Creating a temporary self-signed certificate for $DOMAIN"
mkdir -p "$CERT_PATH"
docker compose run --rm --entrypoint "\
	openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
		-keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
		-out '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
		-subj '/CN=localhost'" certbot

echo "==> Starting nginx so it can serve the ACME challenge"
# --force-recreate so a container left crash-looping by an earlier attempt picks up
# the new config and the certificate we just planted, rather than continuing to fail.
docker compose up -d --force-recreate nginx

# Wait until nginx genuinely serves the challenge directory before going any further.
# Without this the script would delete the temporary certificate underneath a
# still-restarting nginx, leaving it permanently unable to start -- and Let's Encrypt
# would then fail with "Connection refused", which looks like a firewall problem and
# is not one.
echo "==> Waiting for nginx to serve the ACME challenge path"
mkdir -p ./certbot/www/.well-known/acme-challenge
PROBE="probe-$$"
echo "ok" > "./certbot/www/.well-known/acme-challenge/$PROBE"

READY=0
for _ in $(seq 1 30); do
	if curl -sf -o /dev/null "http://localhost/.well-known/acme-challenge/$PROBE" 2>/dev/null; then
		READY=1
		break
	fi
	sleep 2
done
rm -f "./certbot/www/.well-known/acme-challenge/$PROBE"

if [ "$READY" != "1" ]; then
	echo "" >&2
	echo "nginx is not serving http://localhost/.well-known/acme-challenge/" >&2
	echo "Requesting a certificate now would fail and burn a rate-limit attempt." >&2
	echo "" >&2
	echo "Recent nginx output:" >&2
	docker compose logs nginx --tail 20 >&2
	exit 1
fi
echo "    nginx is serving the challenge path"

echo "==> Removing the temporary certificate"
docker compose run --rm --entrypoint "\
	rm -rf /etc/letsencrypt/live/$DOMAIN \
		/etc/letsencrypt/archive/$DOMAIN \
		/etc/letsencrypt/renewal/$DOMAIN.conf" certbot

echo "==> Requesting a certificate from Let's Encrypt"
echo "    covering $DOMAIN and $ADMIN_DOMAIN"
STAGING_ARG=""
if [ "$STAGING" != "0" ]; then
	echo "    (using the staging CA -- the certificate will NOT be trusted by browsers)"
	STAGING_ARG="--staging"
fi

docker compose run --rm --entrypoint "\
	certbot certonly --webroot -w /var/www/certbot \
		$STAGING_ARG \
		--email $EMAIL \
		-d $DOMAIN \
		-d $ADMIN_DOMAIN \
		--rsa-key-size 4096 \
		--agree-tos \
		--no-eff-email \
		--force-renewal" certbot

echo "==> Reloading nginx with the real certificate"
docker compose exec nginx nginx -s reload

echo ""
echo "Done. Bring the whole stack up with:  docker compose up -d"
echo ""
echo "  Guests:  https://$DOMAIN/"
echo "  Admin:   https://$ADMIN_DOMAIN/   (sign in, then add guests and print invitations)"

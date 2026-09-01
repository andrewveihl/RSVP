# Standard proxy wiring for both upstreams.
#
# X-Forwarded-For is what the apps' per-IP rate limiters read, and X-Forwarded-Proto
# is how adapter-node knows the request arrived over TLS.

proxy_http_version 1.1;

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        "";

proxy_connect_timeout 60s;
proxy_read_timeout  120s;
proxy_send_timeout  120s;

# Both apps set the same security headers themselves, so that they are still safe when
# run without nginx in front -- in development, in the E2E suite, or if a container port
# is ever exposed by mistake. Behind nginx that would mean two copies of each header;
# hiding the upstream's leaves exactly one, and makes this config the single place they
# are defined in production.
proxy_hide_header Strict-Transport-Security;
proxy_hide_header X-Content-Type-Options;
proxy_hide_header X-Frame-Options;
proxy_hide_header X-XSS-Protection;
proxy_hide_header Referrer-Policy;
proxy_hide_header Permissions-Policy;
proxy_hide_header Content-Security-Policy;

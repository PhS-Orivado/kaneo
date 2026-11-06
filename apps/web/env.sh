#!/bin/sh
set -eu

# Values are read through awk's ENVIRON, never interpolated into shell, sed,
# JavaScript, or nginx source. Do not print public or private environment values.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
asset_source=/usr/share/nginx/html
asset_root=/var/lib/kaneo/html
export KANEO_ENV_RENDERER="$script_dir/env.awk"

# The image's assets stay immutable. A volume at /var/lib/kaneo also supports
# read-only root filesystems and OpenShift's arbitrary runtime UID.
mkdir -p "$asset_root" /var/lib/kaneo/nginx /var/lib/kaneo/tmp
cp -R "$asset_source/." "$asset_root/"
chmod -R u+rwX "$asset_root"

if [ -z "${KANEO_API_URL:-}" ]; then
  echo "WARNING: KANEO_API_URL is not set. API calls may fail." >&2
fi

# Runs after nginx's template hook, so rendered templates are checked too.
# Server configs from older images serve the unconfigured build from there.
if grep -qsF /usr/share/nginx/html /var/lib/kaneo/nginx/conf.d/*.conf; then
  echo "WARNING: An nginx server config uses /usr/share/nginx/html, which serves the unconfigured build. Change it to root /var/lib/kaneo/html;" >&2
fi

# find -exec preserves spaces/newlines in filenames. Write each replacement
# beside its source before atomically replacing the complete file.
find "$asset_root" -type f -name '*.js' -exec sh -eu -c '
  for asset do
    temporary=$(mktemp "${asset}.XXXXXX")
    trap '\''rm -f "$temporary"'\'' EXIT HUP INT TERM
    LC_ALL=C awk -v mode=bundle -f "$KANEO_ENV_RENDERER" "$asset" > "$temporary"
    chmod 644 "$temporary"
    mv "$temporary" "$asset"
    trap - EXIT HUP INT TERM
  done
' sh {} +

# Serve JSON as static content. It must never become an nginx configuration
# string, where quotes, backslashes, and dollar signs have another meaning.
for mode in resource authorization; do
  target="$asset_root/mcp-oauth-$mode.json"
  temporary=$(mktemp "${target}.XXXXXX")
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  LC_ALL=C awk -v mode="$mode" -f "$KANEO_ENV_RENDERER" > "$temporary"
  chmod 644 "$temporary"
  mv "$temporary" "$target"
  trap - EXIT HUP INT TERM
done

# Split web/api deployments: the web container proxies /api/ to the backend
# service. apps/web/nginx.conf and apps/web/nginx.kaneo.conf reference the
# $kaneo_api_target variable unconditionally, so this file must always exist.
# nginx resolves the target at request time through Docker's embedded DNS, so
# a recreated API container with a new IP address no longer causes 502 errors
# from an address stale since nginx startup. The value is validated strictly
# because it becomes part of an nginx configuration string.
api_proxy_target="${KANEO_API_PROXY_TARGET:-127.0.0.1:1337}"
case "$api_proxy_target" in
  [A-Za-z0-9._-]*:[0-9]*)
    ;;
  *)
    echo "ERROR: KANEO_API_PROXY_TARGET must be host:port." >&2
    exit 1
    ;;
esac
# nginx reads its server configuration from the writable runtime storage that
# 05-kaneo-runtime-storage.sh seeds from /etc/nginx/conf.d before this script
# runs, so the generated map must be written there as well. Fall back to
# /etc/nginx/conf.d when the runtime layout is absent (older images).
if [ -d /var/lib/kaneo/nginx/conf.d ]; then
  conf_dir=/var/lib/kaneo/nginx/conf.d
else
  conf_dir=/etc/nginx/conf.d
fi
if [ -w "$conf_dir" ]; then
  temporary=$(mktemp "${conf_dir}/api-upstream.conf.XXXXXX")
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  printf 'resolver 127.0.0.11 valid=10s ipv6=off;\nmap $host $kaneo_api_target {\n    default "http://%s";\n}\n' "$api_proxy_target" > "$temporary"
  chmod 644 "$temporary"
  mv "$temporary" "$conf_dir/api-upstream.conf"
  trap - EXIT HUP INT TERM
else
  echo "WARNING: $conf_dir is not writable; skipping API target configuration." >&2
fi

echo "Public web configuration prepared."

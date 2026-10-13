#!/bin/sh
set -eu

# Values are read through awk's ENVIRON, never interpolated into shell, sed,
# JavaScript, or nginx source. Do not print public or private environment values.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
asset_root=/usr/share/nginx/html
export KANEO_ENV_RENDERER="$script_dir/env.awk"

if [ -z "${KANEO_API_URL:-}" ]; then
  echo "WARNING: KANEO_API_URL is not set. API calls may fail." >&2
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
# service. apps/web/nginx.conf references this upstream unconditionally, so
# the file must always exist. The value is validated strictly because it
# becomes part of an nginx configuration string.
api_proxy_target="${KANEO_API_PROXY_TARGET:-127.0.0.1:1337}"
case "$api_proxy_target" in
  [A-Za-z0-9._-]*:[0-9]*)
    ;;
  *)
    echo "ERROR: KANEO_API_PROXY_TARGET must be host:port." >&2
    exit 1
    ;;
esac
conf_dir=/etc/nginx/conf.d
if [ -w "$conf_dir" ]; then
  temporary=$(mktemp "${conf_dir}/api-upstream.conf.XXXXXX")
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  printf 'upstream kaneo_api_backend {\n    server %s;\n}\n' "$api_proxy_target" > "$temporary"
  chmod 644 "$temporary"
  mv "$temporary" "$conf_dir/api-upstream.conf"
  trap - EXIT HUP INT TERM
else
  echo "WARNING: $conf_dir is not writable; skipping API upstream configuration." >&2
fi

echo "Public web configuration prepared."

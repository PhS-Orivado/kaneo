#!/usr/bin/env bash
#
# Build and push the kaneo container images to ghcr.io from a local checkout.
#
# Mirrors .github/workflows/build-images-manual.yml: it builds the same three
# images (kaneo, web, api), tags them in ghcr.io/<owner>/<name>, and optionally
# also tags them as latest. Intended for local use; the GitHub Actions
# workflows remain the source of truth for released and nightly tags.
#
# Usage:
#   scripts/images/build-and-push.sh [options]
#
# Options:
#   --images <list>     Comma-separated subset of kaneo,web,api. Default: all three.
#   --tag <tag>         Tag applied to every published image. Default: dev.
#   --latest            Also tag the images as latest.
#   --platforms <list>  Target platforms for the buildx build. Default: linux/amd64.
#   --owner <owner>     GHCR namespace (the GitHub owner, lowercase). Default:
#                       phs-orivado, or $GHCR_OWNER when set.
#   --no-push           Build locally with --load instead of pushing; the images
#                       stay in the local docker store tagged as ghcr.io/<owner>/<name>.
#   --login-user <user> Log in to ghcr.io as <user> using $GHCR_TOKEN before building.
#                       Requires a token with write:packages scope.
#   -h, --help          Print this help and exit.

set -euo pipefail

DEFAULT_IMAGES="kaneo,web,api"
DEFAULT_TAG="dev"
DEFAULT_PLATFORMS="linux/amd64"
DEFAULT_OWNER="phs-orivado"

IMAGES="${DEFAULT_IMAGES}"
TAG="${DEFAULT_TAG}"
PLATFORMS="${DEFAULT_PLATFORMS}"
OWNER="${GHCR_OWNER:-${DEFAULT_OWNER}}"
PUSH="true"
LOGIN_USER=""

usage() {
  sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --images) IMAGES="${2:?--images requires a value}"; shift 2 ;;
    --tag) TAG="${2:?--tag requires a value}"; shift 2 ;;
    --latest) LATEST="true"; shift ;;
    --platforms) PLATFORMS="${2:?--platforms requires a value}"; shift 2 ;;
    --owner) OWNER="${2:?--owner requires a value}"; shift 2 ;;
    --no-push) PUSH="false"; shift ;;
    --login-user) LOGIN_USER="${2:?--login-user requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# GHCR only accepts lowercase image names.
OWNER="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"

command -v docker > /dev/null 2>&1 || die "docker is not installed or not in PATH"
docker buildx version > /dev/null 2>&1 || die "docker buildx is required but was not found"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

REVISION=""
if command -v git > /dev/null 2>&1 && git rev-parse HEAD > /dev/null 2>&1; then
  REVISION="$(git rev-parse HEAD)"
fi

# Validate the requested image selection.
IFS=',' read -r -a REQUESTED <<< "$IMAGES"
[ "${#REQUESTED[@]}" -gt 0 ] || die "no images selected"
BUILD=()
for image in "${REQUESTED[@]}"; do
  case "$image" in
    kaneo) BUILD+=("kaneo|Dockerfile.kaneo") ;;
    web) BUILD+=("web|apps/web/Dockerfile") ;;
    api) BUILD+=("api|apps/api/Dockerfile") ;;
    "") ;; # tolerate empty entries from a trailing comma
    *) die "unknown image '$image' (expected a subset of kaneo,web,api)" ;;
  esac
done
[ "${#BUILD[@]}" -gt 0 ] || die "no images selected"

# Optional automated GHCR login.
if [ -n "$LOGIN_USER" ]; then
  [ -n "${GHCR_TOKEN:-}" ] || die "--login-user requires GHCR_TOKEN to be set"
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$LOGIN_USER" --password-stdin
fi

if [ "$PUSH" = "true" ]; then
  # Refuse to push to a registry we are not authenticated against.
  grep -q "ghcr.io" ~/.docker/config.json 2>/dev/null ||
    die "not logged in to ghcr.io: run 'docker login ghcr.io' or pass --login-user with GHCR_TOKEN"
fi

# Source-map upload stays with CI: local builds never pass the Sentry build
# inputs, matching the workflow's behavior when SENTRY_AUTH_TOKEN is absent.

OCI_LABELS=(
  --label "org.opencontainers.image.source=https://github.com/PhS-Orivado/kaneo"
  --label "org.opencontainers.image.version=${TAG}"
)
[ -n "$REVISION" ] && OCI_LABELS+=("--label" "org.opencontainers.image.revision=${REVISION}")

PUSH_MODE_ARGS=()
if [ "$PUSH" = "true" ]; then
  PUSH_MODE_ARGS=(--push)
else
  # Multi-platform builds cannot be loaded into the local store; force a
  # single platform unless the caller explicitly requested more.
  if [ "$PLATFORMS" = "$DEFAULT_PLATFORMS" ]; then
    PUSH_MODE_ARGS=(--load)
  elif [ "$PLATFORMS" != "linux/amd64" ] && [ "$PLATFORMS" != "linux/arm64" ]; then
    die "--no-push with --platforms requires exactly one platform; multi-platform builds only support --push"
  else
    PUSH_MODE_ARGS=(--load)
  fi
fi

echo "Registry namespace : ghcr.io/${OWNER}"
echo "Tag                : ${TAG}"
if [ "${LATEST:-}" = "true" ]; then echo "Additional tag     : latest"; fi
echo "Platforms          : ${PLATFORMS}"
echo "Push               : ${PUSH}"
echo ""

for entry in "${BUILD[@]}"; do
  name="${entry%%|*}"
  dockerfile="${entry#*|}"
  [ -f "$dockerfile" ] || die "dockerfile not found: $dockerfile"

  image_ref="ghcr.io/${OWNER}/${name}"
  tags=(--tag "${image_ref}:${TAG}")
  [ "${LATEST:-}" = "true" ] && tags+=(--tag "${image_ref}:latest")

  echo "==> Building ${image_ref}:${TAG} from ${dockerfile}"
  # shellcheck disable=SC2086
  docker buildx build \
    --file "$dockerfile" \
    --platform "$PLATFORMS" \
    "${tags[@]}" \
    "${OCI_LABELS[@]}" \
    "${PUSH_MODE_ARGS[@]}" \
    .
done

echo ""
if [ "$PUSH" = "true" ]; then
  echo "Done. Published images:"
else
  echo "Done. Images available locally:"
fi
for entry in "${BUILD[@]}"; do
  name="${entry%%|*}"
  echo "  ghcr.io/${OWNER}/${name}:${TAG}"
  if [ "${LATEST:-}" = "true" ]; then
    echo "  ghcr.io/${OWNER}/${name}:latest"
  fi
done

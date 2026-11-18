# Local image build and push script

`scripts/images/build-and-push.sh` builds the kaneo container images from a local checkout and pushes them to the GitHub Container Registry (ghcr.io), without going through GitHub Actions.

## Purpose

The Action workflows cover the CI side of image publishing:

- `docker.yml` rebuilds an already reviewed `vX.Y.Z` tag and is restricted to the default branch.
- `nightly.yml` publishes the `nightly` tag from the default branch.
- `build-images-manual.yml` and `build-images-selected.yml` build on demand from any branch.

This script covers the remaining gap: building and publishing from a developer machine, for example while iterating on a Dockerfile or validating a fix before opening a pull request. It builds the same images as the workflows:

- `ghcr.io/<owner>/kaneo` built from `Dockerfile.kaneo` (bundled image)
- `ghcr.io/<owner>/web` built from `apps/web/Dockerfile`
- `ghcr.io/<owner>/api` built from `apps/api/Dockerfile`

## Prerequisites

- Docker with the buildx plugin.
- If the script is not executable in your checkout, run it through bash: `bash scripts/images/build-and-push.sh`.
- A GHCR login with package push rights. Either log in beforehand:

  ```console
  echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
  ```

  or pass `--login-user <github-user>` with `GHCR_TOKEN` exported, and the script performs the login. The token needs the `write:packages` scope.
- For multi-platform builds (`--platforms`), QEMU must be set up (`docker run --privileged --rm tonistiigi/binfmt --install all`).

## Usage

```console
# Build and push all three images, tagged dev:
scripts/images/build-and-push.sh

# Build and push only the api image, tagged with the current git short SHA:
scripts/images/build-and-push.sh --images api --tag "$(git rev-parse --short HEAD)"

# Multi-platform build that also moves the latest tag:
scripts/images/build-and-push.sh --platforms linux/amd64,linux/arm64 --latest

# Build locally without pushing (images remain in the local docker store):
scripts/images/build-and-push.sh --no-push
```

## Options

- `--images <list>`: comma-separated subset of `kaneo`, `web`, `api`. Defaults to all three. Unknown and empty selections fail before any build starts.
- `--tag <tag>`: tag applied to every published image. Defaults to `dev`.
- `--latest`: also tags the images as `latest`. Disabled by default so a local build never silently replaces the production tag.
- `--platforms <list>`: target platforms for the buildx build. Defaults to `linux/amd64`. Multi-platform builds push straight to the registry; a single platform can be loaded locally with `--no-push`.
- `--owner <owner>`: GHCR namespace, the GitHub owner in lowercase. Defaults to `phs-orivado`, or to `$GHCR_OWNER` when set. GHCR only accepts lowercase image names, so the value is lowercased automatically.
- `--no-push`: builds with `--load` instead of `--push`; the images stay in the local docker store under their `ghcr.io/<owner>/<name>` references.
- `--login-user <user>`: logs in to ghcr.io as `<user>` with `$GHCR_TOKEN` before building.
- `-h`, `--help`: prints the embedded usage text.

## Sentry source maps

The script never passes the Sentry build inputs. Source-map upload stays with CI, matching the workflow behavior when `SENTRY_AUTH_TOKEN` is absent: the web Dockerfile simply skips the upload. Local builds therefore never need `SENTRY_ORG`, `SENTRY_PROJECT`, or `SENTRY_AUTH_TOKEN`.

## Safety rails

- The script refuses to push when no ghcr.io credentials are present in the Docker configuration.
- Invalid image names fail before any build starts.
- `--no-push` combined with more than one platform fails early, since multi-platform manifests cannot be loaded into the local docker store.
- Released (`vX.Y.Z`) and `nightly` tags remain owned by the CI workflows; when building locally, pick a tag that cannot collide with them (the default `dev` tag or a git SHA).

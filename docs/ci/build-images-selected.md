# Selected image build workflow

`.github/workflows/build-images-selected.yml` builds a chosen subset of the container images and pushes them to GHCR on demand.

## Purpose

The manual image workflows cover different needs:

- `build-images-manual.yml` always builds all three images.
- `docker.yml` rebuilds an already reviewed `vX.Y.Z` tag and is restricted to the default branch.
- `nightly.yml` publishes the `nightly` tag from the default branch.
- `build-images.yml` is the shared reusable pipeline behind the release-oriented workflows, and it enforces release-source verification.

This workflow fills the remaining gap: building and publishing only the images you select, from an arbitrary branch (for example `develop`) without a release tag.

## Usage

1. Open the Actions tab and select the workflow named Build & push selected images (manual).
2. Choose the branch to build from.
3. Provide the inputs and run the workflow.

## Inputs

- `images`: comma-separated subset of `kaneo`, `web`, `api` to build. Defaults to `kaneo,web,api`. Unknown names and an empty selection fail the validation job before any build starts.
- `tag`: tag applied to every published image. Defaults to `dev`.
- `latest`: also tags the images as `latest`. Disabled by default so a manual build never silently replaces the production tag.
- `platforms`: target platforms for the multi-arch build. Defaults to `linux/amd64,linux/arm64`.

## Published images

Only the images named in the `images` input are built and pushed:

- `ghcr.io/<owner>/kaneo` built from `Dockerfile.kaneo` (bundled image)
- `ghcr.io/<owner>/web` built from `apps/web/Dockerfile`
- `ghcr.io/<owner>/api` built from `apps/api/Dockerfile`

## Selection validation

The validation job turns the `images` input into the build matrix. It trims whitespace, drops empty entries, removes duplicates, and rejects any name outside the `kaneo`, `web`, `api` allowlist. A rejected selection fails immediately, so an invalid request never reaches a build job.

## Required configuration

The workflow requires the following repository secrets and variables, identical to the existing image pipelines:

- Secret `GH_PACKAGE_TOKEN`: a GitHub token with package write access, used for the GHCR login.
- Secret `SENTRY_AUTH_TOKEN` (optional): used only by the web image to upload source maps.
- Variables `SENTRY_ORG` and `SENTRY_PROJECT` (optional): passed as build arguments.

If `GH_PACKAGE_TOKEN` is missing, the registry login fails before any build starts.

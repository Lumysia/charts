# charts

docker build factory

## Layout

Each project directory holds one image. Every `<variant>.env` file is one variant: `PLATFORMS` (required) plus build arguments. The image is built from the project's `Dockerfile`, or from the git repository on the first line of `external-git.txt` (optional second line: a tag, a branch or `latest-release`). A `disabled` file skips a project and `*.env.disabled` variants are not built. Build arguments named `<NAME>_REPO` (a git URL) and `<NAME>_REF` are tracked as upstream sources.

## Builds

`.github/workflows/docker-ci.yml` uses `ci/plan.mjs` to select variants:

- Pushes to `main` build changed projects and publish `<variant>-nightly`. Tag pushes publish `<variant>-<tag>`; the last variant of each project (by file name) also gets `latest`.
- Every six hours the workflow compares each published nightly image with its inputs: the digest of every image in its `FROM` lines and the commit of every upstream git source. These are recorded on the image in the `ci.build.inputs` label and read back from the registry without pulling. Only changed variants build, plus anything last built seven or more days ago.
- Manual runs do the same check, optionally for one project, or rebuild unconditionally with `force`.
- Pull requests only run `node --test ci/`.

Repository settings: Actions variables `CONTAINER_REGISTRY`, `CONTAINER_NAMESPACE` and `REGISTRY_USERNAME`, and the secret `REGISTRY_TOKEN`. There are no fallbacks.

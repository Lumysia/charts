# Bulwark under /webmail

Builds the [official Bulwark source](https://github.com/bulwarkmail/webmail) with its original Dockerfile. No source patches are applied.

Each build resolves the latest published, non-prerelease GitHub release, checks out its tag, and records the source commit in the Actions summary and Bulwark's About screen. Existing projects without a second line in `external-git.txt` keep using their default branch. The optional second line accepts a release tag or `latest-release` for a GitHub repository.

The build arguments set `NEXT_PUBLIC_BASE_PATH=/webmail` and `NEXT_PUBLIC_LOCALE_PREFIX=always`, following the [official subpath deployment guide](https://bulwarkmail.org/docs/deployment/docker/reverse-proxy#subpath-deployment).

The default-branch build publishes `essaypu/bulwark:webmail-nightly` to Docker Hub through the existing workflow. Despite the shared workflow's `nightly` suffix, this image uses an upstream release, not its development branch. The workflow also rebuilds on the existing twice-monthly schedule or through a manual run with `project=bulwark`.

Forward `/webmail/*` to port 3000 without removing the prefix. Bulwark's administration page is `/webmail/admin`; its OAuth callbacks include the prefix, such as `/webmail/en/auth/callback`. Configure the JMAP server URL to the existing Stalwart origin. Stalwart remains a separate required mail server.

Bulwark is licensed under AGPL-3.0. Its source remains available from the upstream repository linked above.

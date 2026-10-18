# Apple Music Ripper (ALACarte) — Home Assistant add-on

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/alacarte-ha).

Home Assistant OS add-on wrapping [norifm/alacarte](https://github.com/norifm/alacarte):
downloads Apple Music songs, albums, and **followed playlists** as DRM-free lossless
FLAC (ALAC → FLAC, embedded artwork/metadata/lyrics) straight into the HA media library.
Built from the upstream source at add-on build time (`ALACARTE_REF` in the Dockerfile);
the daily bump workflow raises the add-on version when upstream moves, and Supervisor
rebuilds on update.

This is the single-container variant: the ALACarte web app, the FairPlay wrapper, and
its login supervisor all run in one add-on container. For the plain two-container
Docker Compose variant, see [../alacarte/](../alacarte/).

## Install

1. Add this repository (`https://github.com/Lumysia/charts`) as a custom add-on
   repository under Settings → Devices & Services → Add-ons.
2. Install **Apple Music Ripper (ALACarte)**.
3. Open the add-on Web UI, sign in with your Apple ID (2FA supported; the session
   persists across updates).
4. Search or import a playlist, hit **Follow** on a playlist — new additions are
   ripped automatically.

## Music library

Output goes to `music_path` (default `/media/music`) inside the HA `media` share:

```text
/media/music/<Artist>/<Album>/01. Track.flac
/media/music/Playlists/<Playlist>.m3u8
```

- Browse it in HA Media Browser; add the folder as a local provider in Music
  Assistant to get it in your HA library.
- Playlist downloads reuse the artist/album files; only the `.m3u8` is playlist-specific.

## Requirements

- **amd64 only** — the FairPlay wrapper binary and downloader base are x86_64.
  The add-on will not install on Raspberry Pi / Blue / Yellow / Green.
- An active Apple Music subscription.

## Notes

- The add-on needs `SYS_ADMIN`/`SYS_CHROOT`/`MKNOD` privileges for the wrapper's
  Android chroot (device nodes + bind mount of the session into `/data`).
- Apple soft-rate-limits bulk archiving by IP (~1500 songs → about a day).
- Upstream is AGPL-3.0; source remains available at the repository linked above.

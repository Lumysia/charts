# Music Assistant with extra providers

A Home Assistant app that runs the official [Music Assistant](https://music-assistant.io) server image and also loads providers you put in its config folder. Everything else matches the official Music Assistant app.

## Install

1. In Home Assistant, go to **Settings → Apps → App store**, open the menu, choose **Repositories**, and add `https://github.com/Lumysia/charts`.
2. Install **Music Assistant (custom)** and start it. Stop the official Music Assistant app first: both use host networking and port 8095.

## Adding providers

Put each provider in its own folder under the app's public config folder, for example `/addon_configs/<id>_music_assistant_custom/providers/<domain>/` (shown as `/app_configs/...` in newer Terminal & SSH apps). The folder name must match the `domain` in its `manifest.json`. Restart the app to load or remove a provider. A folder with the same name as a built-in provider replaces it.

The app log shows `[ma-custom] Linked provider <domain>` for each one, and Music Assistant logs each provider under its own name.

## Moving data from the official app

On the first start, if the app has no data yet and `/share/ma-migrate/data` exists, its contents are copied in. Extract the `data` folder from a backup of the official app (taken while it was stopped) into `/share/ma-migrate/`, start this app, and delete the folder afterwards.

## Updates

`.github/workflows/music-assistant-bump.yml` checks the official app every day. When it moves to a new stable version, the workflow updates `version` in `config.yaml`, `MA_VERSION` in the `Dockerfile` and the reference copy `upstream-config.yaml`, so Home Assistant offers the update and can install it with auto-update. It stops with an error instead if the official app changed anything else in its configuration, since that needs a person to look at it.

The `disabled` file keeps the repository's Docker build workflow from treating this folder as an image to build.

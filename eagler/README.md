# Eaglercraft launcher

This folder feeds the Eaglercraft section of Flash Games. Structure:

```
eagler/
  clients.json   <- the manifest that ties everything together
  files/         <- client .html files go here
  imgs/          <- client cover images go here
```

## Adding a client

1. Drop the client file into `eagler/files/`, e.g. `files/MyClient 1.12 WASM.html`.
2. Drop its cover image into `eagler/imgs/`, e.g. `imgs/myclient.png`.
3. Add an entry to `clients.json`:

```json
{
  "id": "myclient-112",
  "name": "MyClient 1.12",
  "version": "1.12",
  "file": "files/MyClient 1.12 WASM.html",
  "image": "imgs/myclient.png",
  "description": "A short description of the client.",
  "tags": ["WASM", "1.12", "Mods"],
  "featured": false
}
```

Schema notes:
- `file` and `image` paths written `files/…` / `imgs/…` are resolved relative
  to `eagler/`. You can also use explicit `./offline/…` paths to point at
  anything else bundled with the app (see the default entries).
- `id` is optional — it is generated from the name when omitted. Keep it once
  generated so favourites/installs stay stable across edits.
- `featured: true` highlights a client at the top of the launcher.
- The launcher caches the last good manifest, so a client list survives
  offline sessions.

Bundled defaults (see `core.js` → `EAGLER_BUNDLED`) point at the existing
`offline/` builds, so the launcher works even before clients.json gains new
entries.

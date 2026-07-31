# TriChess: Conquered Armies

A working Progressive Web App prototype for a three-player chess game in which capturing an enemy king transfers command of that player's surviving pieces to the victor.

## Included in version 0.1

- Local three-player pass-and-play
- Gold, Blue, and Red armies
- Standard king, queen, rook, bishop, knight, and pawn movement
- Check protection: a player cannot make a move that leaves their own king attacked
- King capture and defeated-army transfer
- Pawn promotion to queen
- Undo
- Automatic local saving and resume
- Board rotation
- Optional move sounds
- Installable manifest and offline service worker
- Responsive phone, tablet, and desktop layout

## Important prototype decision

This first build uses a 12-by-12 square board so the full gameplay loop can be tested immediately. The game engine is separated from the interface well enough to replace this with a historically accurate triangular or three-wing board in a later build.

The first build uses capture-the-king elimination rather than full checkmate adjudication. Check rules are enforced for the moving player's own king.

## Run locally

A service worker requires HTTP or HTTPS. From this folder, run one of these commands:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the contents of this folder to a GitHub repository and enable Pages from the repository settings. The app uses only relative paths, so it can run from a project subdirectory.

## Recommended next build

1. Replace the prototype board with the chosen historical board geometry.
2. Add complete checkmate and stalemate resolution.
3. Add one-player and two-player computer modes.
4. Add game setup options and rule variants.
5. Add move history, notation, tutorials, and animation.
6. Package with Capacitor for the Apple App Store and Google Play.

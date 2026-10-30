# Level 1 – 2D Platformer (KAPLAY)

## How to Run
- Open `index.html` in Chrome (requires an internet connection to load KAPLAY from jsDelivr), or run `python3 -m http.server` in this folder and open `http://localhost:8000`.
- To publish online: upload the folder to a GitHub repository and enable Settings > Pages > Deploy from branch (`main`, root).

## Controls
Left/Right Arrow keys or A/D to move, SPACE to jump, Down Arrow (or S) while standing on top of the green pipe to warp to Part 2, and R to restart immediately.

## Where to Edit Live
- **Level Map:** `level.js` (symbol key included at the top of the file). Any space without a block underneath is a bottomless pit. The elevator (`M`) and its behavior constants are located at the top of `game.js`.
- **Physics & Game Feel:** Constants grouped at the very top of `game.js` (gravity, jump force, movement speed, coyote time, jump buffer, and camera look-ahead).
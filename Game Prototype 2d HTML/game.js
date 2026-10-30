/* =====================================================================
   game.js  -  GAME LOGIC (fully commented English version)
   Library: KAPLAY (loaded in index.html before this file).
   The map (the LEVEL variable) comes from level.js, also loaded before this file.

   File structure:
     1. Constants (everything you change to tune how the game feels)
     2. Data calculated from the map
     3. KAPLAY initialization and Web Audio sound synthesis
     4. Global run state
     5. Scenes: "title" (start screen), "end" (victory screen), and "game" (the level)
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. CONSTANTS
   Everything that affects game feel sits right here at the top.
   For the live class presentation: change a number, save, and reload.
   --------------------------------------------------------------------- */
const TITLE = "LEVEL 1";       // title screen text
const TILE = 32;               // size of each map block in pixels

// --- Player Physics ---
const GRAVITY = 1800;          // how fast the player falls (higher = falls faster)
const JUMP_FORCE = 620;        // jump strength (higher = jumps higher)
const SPEED = 200;             // horizontal walking speed in pixels per second
const STOMP_BOUNCE = 380;      // upward bounce received when stomping an enemy

// --- Elevator ---
const ELEVATOR_SPEED = 60;     // vertical movement speed (up and down)
const ELEVATOR_RANGE = 3 * 32; // how far it rises from its bottom position (3 blocks)
const ELEVATOR_PAUSE = 0.8;    // seconds it waits at the top and bottom ends
const ELEVATOR_W = 3 * 32;     // platform width (3 blocks)

// --- Enemies ---
const ENEMY_SPEED = 50;        // horizontal patrol speed

// --- Jump Forgiveness (makes controls feel responsive and fair) ---
const COYOTE_TIME = 0.1;       // you can still jump 0.1 s after walking off a ledge
const JUMP_BUFFER = 0.1;       // pressing jump 0.1 s before landing still triggers a jump

// --- Camera ---
const CAMERA_LOOKAHEAD = 140;  // camera shifts 140 px ahead to show upcoming hazards
const CAMERA_SMOOTH = 8;       // how fast the camera catches up (higher = tighter follow)

// --- Other Settings ---
const RESTART_DELAY = 0.35;    // seconds between dying and respawning (under 1 second)
const PW = 24, PH = 28;        // player collision width and height
const EW = 24, EH = 26;        // enemy collision width and height
const PX = 3;                  // size of each character "pixel" in real screen pixels


/* ---------------------------------------------------------------------
   2. DATA CALCULATED FROM THE MAP
   --------------------------------------------------------------------- */
const ROWS = LEVEL.length;                                 // number of rows in the map
const COLS = Math.max(...LEVEL.map(r => r.length));        // number of columns (longest row)
const MAP_W = COLS * TILE, MAP_H = ROWS * TILE;            // total level dimensions in pixels

// tile(c, r) returns the symbol at column c, row r of the map.
// If out of bounds, it returns "." (empty air).
// Enemies use this to check if there is a wall or ledge ahead of them.
const tile = (c, r) => (LEVEL[r] || "")[c] || ".";


/* ---------------------------------------------------------------------
   3. KAPLAY INITIALIZATION AND SOUND
   --------------------------------------------------------------------- */
// Creates the 960x480 game canvas, scaled to fit the window (letterbox)
// with a sky-blue background in [R, G, B] format.
kaplay({ width: 960, height: 480, letterbox: true, background: [135, 206, 235] });

// Zero-file audio: synthesized directly in the browser via Web Audio API.
const AC = new (window.AudioContext || window.webkitAudioContext)();

// beep(frequency, duration, waveType, volume)
// Higher frequency = higher pitch. Example: beep(880, 0.07) plays a short high ping.
function beep(freq, dur, type = "square", vol = 0.06) {
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) {}  // if the browser blocks audio before interaction, the game continues safely
}


/* ---------------------------------------------------------------------
   3b. PROCEDURAL PIXEL ART CHARACTERS (drawn with rectangles, no external images)
   Each character is an 8-column x 9-row grid. Each letter maps to a palette color
   and "." is transparent. Each pixel square measures PX (3) screen pixels.
     h = hair   s = skin   e = eyes   k = eyebrows   b = shirt   t = tie   p = pants
   --------------------------------------------------------------------- */
const PAL_PLAYER = { h: [85, 50, 25], s: [255, 200, 160], e: [30, 25, 25], k: [85, 50, 25], b: [90, 160, 255], t: [110, 60, 30], p: [45, 45, 80] };   // blue player
const PAL_ENEMY  = { h: [110, 10, 10], s: [255, 190, 160], e: [30, 15, 15], k: [90, 0, 0],   b: [220, 50, 45],  t: [100, 10, 10], p: [60, 20, 20] };   // red enemy

// Returns the 9 rows of the character sprite depending on its state:
//   frame (0 or 1) = alternates legs while walking
//   armsUp         = true when airborne (raises arms while jumping)
//   angry          = true for enemies (furrowed eyebrows)
function pixelRows(frame, armsUp, angry) {
  return [
    "..hhhh..",
    ".hhhhhh.",
    angry ? ".skssks." : ".ssssss.",
    ".sesses.",
    armsUp ? "sbbttbbs" : ".bbttbb.",
    armsUp ? ".bbttbb." : "sbbttbbs",
    ".bbbbbb.",
    "..pppp..",
    frame === 0 ? "..p..p.." : "...pp...",
  ];
}

// Draws the pixel rows using the given color palette at offset (ox, oy).
function drawPixels(rows, pal, ox, oy) {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch !== ".") drawRect({ pos: vec2(ox + x * PX, oy + y * PX), width: PX, height: PX, color: rgb(...pal[ch]) });
  }
}


/* ---------------------------------------------------------------------
   4. GLOBAL RUN STATE
   These variables live outside the scenes so they persist when the player
   dies and the "game" scene reloads.
   --------------------------------------------------------------------- */
let runStart = 0;   // timestamp when the run began (used to measure total completion time)

// checkpoint: true once the player warps through the pipe (respawns in Part 2)
// star: true once the player collects the optional star reward
let state = { checkpoint: false, star: false };

// Resets the run state when starting from the title screen or replaying from the end screen.
const newRun = () => { runStart = time(); state = { checkpoint: false, star: false }; };


/* ---------------------------------------------------------------------
   5a. SCENE "title": TITLE SCREEN (text is allowed here)
   --------------------------------------------------------------------- */
scene("title", () => {
  add([text(TITLE, { size: 56 }), pos(width() / 2, 170), anchor("center"), color(30, 30, 60)]);
  add([text("SPACE to start", { size: 24 }), pos(width() / 2, 260), anchor("center"), color(30, 30, 60)]);

  onKeyPress(["space", "enter"], () => { AC.resume(); newRun(); go("game"); });
});


/* ---------------------------------------------------------------------
   5b. SCENE "end": VICTORY SCREEN
   "res" receives the completion metrics from the level: { time, star }
   --------------------------------------------------------------------- */
scene("end", (res) => {
  add([text("Level Complete", { size: 44 }), pos(width() / 2, 150), anchor("center"), color(30, 30, 60)]);
  add([text(`Time: ${res.time.toFixed(1)} s   Star: ${res.star ? "yes" : "no"}`, { size: 24 }), pos(width() / 2, 230), anchor("center"), color(30, 30, 60)]);
  add([text("SPACE to play again", { size: 20 }), pos(width() / 2, 300), anchor("center"), color(30, 30, 60)]);
  onKeyPress(["space", "enter"], () => { newRun(); go("game"); });
});


/* ---------------------------------------------------------------------
   5c. SCENE "game": THE PLAYABLE LEVEL
   Reloads completely upon death (go("game")) for an instant restart.
   --------------------------------------------------------------------- */
scene("game", () => {
  setGravity(GRAVITY);   // applies downward gravity to all objects with "body()"

  let dead = false, player = null;
  let lastGround = -1, lastJump = -1;
  let camX = width() / 2;
  const sensors = [];
  let spawn = vec2(64, 300), exitPos = null;


  // ---- BACKGROUND DECORATION: Clouds ----
  for (let x = 150; x < MAP_W; x += 420) {
    add([pos(x, 40 + (x / 7) % 60), z(-5), {
      draw() { for (const [dx, dy, r] of [[0, 0, 22], [24, -8, 28], [52, 0, 22]]) drawCircle({ pos: vec2(dx, dy), radius: r, color: rgb(255, 255, 255), opacity: 0.9 }); }
    }]);
  }

  // ---- INVISIBLE BOUNDARY WALLS on the left and right edges of the map ----
  for (const x of [-TILE, MAP_W]) add([pos(x, 0), rect(TILE, MAP_H), area(), body({ isStatic: true }), opacity(0)]);


  // ===================================================================
  // BUILDING THE LEVEL FROM THE TEXT MAP
  // ===================================================================
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tile(c, r), x = c * TILE, y = r * TILE;

    if (ch === "#") {
      // ---- SOLID BLOCK ----
      add([pos(x, y), rect(TILE, TILE), color(176, 112, 64), outline(1, rgb(120, 70, 35)), area(), body({ isStatic: true })]);
      // Adds a green grass top strip if there is no solid block directly above it.
      if (tile(c, r - 1) !== "#") add([pos(x, y), rect(TILE, 7), color(70, 170, 70)]);

    } else if (ch === "~") {
      // ---- WATER HAZARD ----
      add([pos(x, y), rect(TILE, TILE), color(47, 127, 209), area(), "hazard", {
        draw() { drawRect({ pos: vec2(2, 8 + Math.sin(time() * 3 + x) * 3), width: 28, height: 3, color: rgb(160, 205, 245) }); }
      }]);

    } else if (ch === "^") {
      // ---- SPIKES HAZARD ----
      // Uses a smaller internal hitbox (20x16) so grazing the visual edge feels fair.
      add([pos(x, y), area({ shape: new Rect(vec2(6, 16), 20, 16) }), "hazard", {
        draw() { drawTriangle({ p1: vec2(0, 32), p2: vec2(16, 8), p3: vec2(32, 32), color: rgb(120, 125, 140) }); }
      }]);

    } else if (ch === "M") {
      // ---- VERTICAL ELEVATOR ----
      // (1) Background vertical rail track
      add([pos(x + ELEVATOR_W / 2 - 2, y - ELEVATOR_RANGE - 16), z(-1), {
        draw() { drawRect({ width: 4, height: ELEVATOR_RANGE + 40, color: rgb(110, 70, 30) }); drawCircle({ pos: vec2(2, 0), radius: 6, color: rgb(150, 100, 50) }); }
      }]);

      // (2) Moving solid platform
      add([pos(x, y), rect(ELEVATOR_W, 12), color(150, 100, 50), outline(2, rgb(110, 70, 30)), area(), body({ isStatic: true }), {
        y0: y,
        up: true,
        wait: ELEVATOR_PAUSE,
        update() {
          if (this.wait > 0) { this.wait -= dt(); return; }
          const hi = this.y0 - ELEVATOR_RANGE;
          let ny = this.pos.y + (this.up ? -1 : 1) * ELEVATOR_SPEED * dt();
          if (ny <= hi) { ny = hi; this.up = false; this.wait = ELEVATOR_PAUSE; }
          else if (ny >= this.y0) { ny = this.y0; this.up = true; this.wait = ELEVATOR_PAUSE; }
          const d = ny - this.pos.y;
          const on = player && !dead && player.pos.x + PW > this.pos.x && player.pos.x < this.pos.x + ELEVATOR_W && Math.abs(player.pos.y + PH - this.pos.y) <= 5;
          this.pos.y = ny;
          if (on) player.pos.y += d;
        }
      }]);

    } else if (ch === "T" || ch === "U") {
      // ---- GREEN PIPES ---- ("T" = Part 1 entrance, "U" = Part 2 exit)
      const rim = tile(c, r - 1) !== ch;
      add([pos(x, y), rect(TILE, TILE), color(53, 168, 83), outline(1, rgb(31, 122, 55)), area(), body({ isStatic: true })]);
      if (rim) add([pos(x - 2, y), rect(TILE + 4, 10), color(80, 200, 110), outline(1, rgb(31, 122, 55))]);

      // Entrance pipe sensor + bouncing green arrow cue (no text needed)
      if (ch === "T" && rim) sensors.push(add([pos(x, y - TILE), area({ shape: new Rect(vec2(2, 0), 28, TILE) }), {
        draw() { drawTriangle({ p1: vec2(8, -18 + Math.sin(time() * 5) * 3), p2: vec2(24, -18 + Math.sin(time() * 5) * 3), p3: vec2(16, -6 + Math.sin(time() * 5) * 3), color: rgb(31, 122, 55) }); }
      }]));

      // Stores exit spawn position above the "U" pipe
      if (ch === "U" && rim && !exitPos) exitPos = vec2(x + 16, y - PH - 1);

    } else if (ch === "*") {
      // ---- STAR (Optional Risk/Reward Collectible) ----
      add([pos(x, y), area({ shape: new Rect(vec2(0, 0), 32, 32) }), "reward", {
        draw() {
          const p = 0.5 + 0.5 * Math.sin(time() * 5);
          drawRect({ pos: vec2(-5 - p * 3, -5 - p * 3), width: 42 + p * 6, height: 42 + p * 6, color: rgb(255, 120, 200), opacity: 0.2 + 0.3 * p, radius: 8 });
          drawRect({ width: 32, height: 32, color: rgb(255, 105, 180), radius: 4 });
          drawTriangle({ p1: vec2(16, 5), p2: vec2(26, 22), p3: vec2(6, 22), color: rgb(120, 40, 160) });
          drawTriangle({ p1: vec2(16, 27), p2: vec2(26, 10), p3: vec2(6, 10), color: rgb(120, 40, 160) });
        }
      }]);

    } else if (ch === "E") {
      // ---- PATROLLING RED ENEMY ----
      add([pos(x + 4, y + 6), area({ shape: new Rect(vec2(0, 0), EW, EH) }), "enemy", {
        dir: -1,
        update() {
          const nx = this.pos.x + this.dir * ENEMY_SPEED * dt();
          const c2 = Math.floor((nx + (this.dir > 0 ? EW : 0)) / TILE), r2 = Math.floor((this.pos.y + 13) / TILE);
          // Reverses direction if it hits a wall "#" or reaches the edge of a platform
          if (tile(c2, r2) === "#" || tile(c2, r2 + 1) !== "#") this.dir *= -1; else this.pos.x = nx;
        },
        draw() {
          drawPixels(pixelRows(Math.floor(time() * 6) % 2, false, true), PAL_ENEMY, 0, -1);
        }
      }]);

    } else if (ch === "F") {
      // ---- GOAL FLAG ----
      add([pos(x + 12, y - TILE), area({ shape: new Rect(vec2(0, 0), 30, 64) }), "goal", {
        draw() {
          drawRect({ width: 5, height: 64, color: rgb(110, 70, 30) });
          drawTriangle({ p1: vec2(5, 0), p2: vec2(5, 24), p3: vec2(30, 12), color: rgb(255, 110, 40) });
        }
      }]);

    } else if (ch === "P") {
      // ---- PLAYER SPAWN POINT ----
      spawn = vec2(x + 4, y + 4);
    }
  }


  // ===================================================================
  // PLAYER INSTANTIATION
  // ===================================================================
  if (state.checkpoint && exitPos) spawn = vec2(exitPos.x - PW / 2, exitPos.y);
  camX = clamp(spawn.x + CAMERA_LOOKAHEAD, width() / 2, MAP_W - width() / 2);

  player = add([pos(spawn), area({ shape: new Rect(vec2(0, 0), PW, PH) }), body(), "player", {
    draw() {
      const moving = isKeyDown("left") || isKeyDown("a") || isKeyDown("right") || isKeyDown("d");
      const frame = moving ? Math.floor(time() * 10) % 2 : 0;
      drawPixels(pixelRows(frame, !player.isGrounded(), false), PAL_PLAYER, 0, 1);
    }
  }]);


  // ===================================================================
  // DEATH & INSTANT RESTART
  // ===================================================================
  function die() {
    if (dead) return;
    dead = true;
    beep(120, 0.25, "sawtooth");
    shake(6);
    wait(RESTART_DELAY, () => go("game"));
  }


  // ===================================================================
  // PLAYER COLLISIONS
  // ===================================================================
  player.onCollide("hazard", die);

  player.onCollide("enemy", (e) => {
    if (dead) return;
    // Landing on top of the enemy stomps it and bounces the player upward; side contact kills
    if (player.pos.y + PH < e.pos.y + 14) { destroy(e); player.jump(STOMP_BOUNCE); beep(660, 0.08); }
    else die();
  });

  player.onCollide("reward", (rw) => {
    destroy(rw);
    state.star = true;
    beep(880, 0.07); wait(0.07, () => beep(1175, 0.12));
  });

  player.onCollide("goal", () => {
    if (dead) return;
    dead = true;
    beep(523, 0.1); wait(0.1, () => beep(784, 0.2));
    go("end", { time: time() - runStart, star: state.star });
  });


  // ===================================================================
  // INPUT BINDINGS
  // ===================================================================
  onKeyPress(["space"], () => { lastJump = time(); });
  onKeyPress("r", () => go("game"));   // R = instant manual restart


  // ===================================================================
  // FRAME-BY-FRAME UPDATE LOOP
  // ===================================================================
  onUpdate(() => {
    if (dead) return;

    const k = (a, b) => isKeyDown(a) || isKeyDown(b);
    const left = k("left", "a"), right = k("right", "d"), up = k("up", "w"), down = k("down", "s");

    // Horizontal movement
    player.move(((right ? 1 : 0) - (left ? 1 : 0)) * SPEED, 0);

    // ---- JUMP with Coyote Time and Input Buffering ----
    if (player.isGrounded()) lastGround = time();
    if (time() - lastJump < JUMP_BUFFER && time() - lastGround < COYOTE_TIME) {
      player.jump(JUMP_FORCE);
      lastJump = -1; lastGround = -1;
      beep(520, 0.08);
    }

    // ---- PIPE TELEPORT: stand on top of "T" + press Down = warp to Part 2 ("U") ----
    if (down && exitPos && player.isGrounded() && sensors.some(sn => player.isColliding(sn))) {
      state.checkpoint = true;
      beep(300, 0.15, "triangle");
      player.pos = vec2(exitPos.x - PW / 2, exitPos.y);
      camX = clamp(player.pos.x + CAMERA_LOOKAHEAD, width() / 2, MAP_W - width() / 2);
      lastGround = -1;
    }

    // ---- SMOOTH CAMERA WITH LOOK-AHEAD ----
    const target = clamp(player.pos.x + CAMERA_LOOKAHEAD, width() / 2, MAP_W - width() / 2);
    camX += (target - camX) * Math.min(1, CAMERA_SMOOTH * dt());
    camPos(camX, height() / 2);

    // ---- BOTTOMLESS PIT CHECK ----
    if (player.pos.y > MAP_H + 64) die();
  });
});


// Start the game at the title screen
go("title");

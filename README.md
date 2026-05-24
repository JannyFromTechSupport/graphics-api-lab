# TVA GLITCH — Escape the Timeline

> *For all time. Always.*

A browser-based arcade game built with **HTML5 Canvas**, **CSS**, and **vanilla JavaScript.** 

🎮 **[Play Now →](https://jannyfromtechsupport.github.io/graphics-api-lab)** 

![alt text](/assets/images/main-menu.png)

![alt text](/assets/images/gameplay.png)

![alt text](/assets/images/game-over-screen.png)

---

## The Game

You are a **Variant**. The TVA has detected you.

Collect glowing **Time Crystals** scattered across the corrupted timeline before **Ms. Minutes** hunts you down. TVA drones join the chase from Wave 2 onwards. Every wave the timeline destabilises further — Ms. Minutes speeds up, more drones spawn, and the canvas glitches out.

Survive as long as you can.

---

## Controls

| Key                       | Action         |
|---------------------------|----------------|
| `W A S D` or `Arrow Keys` | Move           |
| `P`                       | Pause / Resume |
| `M`                       | Mute / Unmute  |

---

## Scoring

| Action                 | Points              |
|------------------------|---------------------|
| Collect a Time Crystal | `100 + (wave × 50)` |
| Complete a wave        | `wave × 200`        |

Crystals required per wave: `5 + wave`. Speed increases every wave.

---

## Graphics Pipeline Implementation

The game explicitly demonstrates the three stages of the graphics pipeline, with `[APPLICATION]`, `[GEOMETRY]`, and `[RASTERISATION]` comments throughout the code.

### Application Stage
Game logic runs here before any rendering — input processing, AI, physics, collision detection, wave progression, and scoring.

### Geometry Stage
Every object uses canvas transform operations:
- **Variant** — `translate` to world position + `rotate` computed from velocity vector via `atan2`
- **Ms. Minutes** — `translate` + `scale` (pulse animation) + compound `rotate` for hour and minute hands
- **Time Crystals** — `translate` + `rotate` (continuous spin) + `scale` (spawn-in animation and pulse)
- **TVA Drones** — `translate` + `rotate` to always face the player
- **Camera shake** — global `translate(shakeX, shakeY)` applied to the entire game layer

### Rasterisation Stage
- Three stacked `<canvas>` elements acting as composited layers (background / game objects / FX)
- `globalAlpha` transparency on motion trails, particles, crystal rings, and drone spawn fade
- Layered concentric hexagons per crystal with decreasing alpha
- Radial gradient corrupt aura on Ms. Minutes that grows as she closes in
- Particle burst system on collect and on hit
- Pixel-shift scanline glitch strips using `getImageData` / `putImageData`
- Cinematic vignette overlay via radial gradient every frame

---

## Objects

| # | Object            | Role                                                              |
|---|-------------------|-------------------------------------------------------------------|
| 1 | **Variant**       | Player — arrow shape with motion trail                            |
| 2 | **Ms. Minutes**   | Enemy — animated clock face with rotating hands and tracking eyes |
| 3 | **Time Crystals** | Collectibles — rotating pulsing hexagons                          |
| 4 | **TVA Drones**    | Enemy — triangle pursuers, spawn from Wave 2                      |

---

## Audio

Built with the **Web Audio API:**

| Sound              | Trigger              |
|--------------------|----------------------|
| Ascending arpeggio | Collect a crystal    |
| Sawtooth alarm     | Getting pruned (hit) |
| Chord sequence     | Wave advance         |
| Clock tick         | Every 30 frames      |    

---

## File Structure

```
tva-glitch/
├── index.html        # HTML structure — HUD, canvas layers, overlay screens
├── style.css         # TVA aesthetic — layout, overlays, animations
├── game.js           # Graphics pipeline — all game logic and rendering
└── assets/
    ├── icons/
    │   ├── miss-minutes.png
    │   └── infinity.png
    └── images/
        ├── game-over-screen.png
        ├── gameplay.png
        └── main-menu.png
```

---

## Built With

- HTML5 Canvas API
- Web Audio API
- Vanilla JavaScript (ES6+)
- CSS3
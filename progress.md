Original prompt: Create a doodle jump video game clone using the image gen to make assets to make it look professional

Updates:
- Scaffolded a vanilla HTML/CSS/JS canvas game with endless vertical scrolling, platforms (static + moving), springs, score/best tracking, and start/game over overlays.
- Added `window.render_game_to_text` and `window.advanceTime(ms)` hooks for automated testing.
- Added fullscreen toggle (F) and pointer/touch input support.

TODO:
- Generate image assets via imagegen (player, platform, moving platform, spring, background).
- Run the Playwright web-game client to validate visuals/controls and capture screenshots.

Updates:
- Generated and saved professional game assets via ImageGen:
  - assets/player.png
  - assets/platform.png
  - assets/platform_moving.png
  - assets/spring.png
  - assets/background.png

TODO:
- Re-run Playwright game test loop and inspect updated screenshots.

Updates:
- Added sprite animation via squash/stretch, bobbing, and tilt based on velocity/input for a more lively character.

Updates:
- Generated a 2x2 player sprite sheet and wired frame-based animation plus landing/boost effects (dust puffs + streaks).

Updates:
- Created an Expo React Native app in `mobile/` and ported the game with sprite sheet animation, dust puffs, and boost streaks.

Updates:
- Added tilt controls via `expo-sensors` Accelerometer (fallback to touch).

Updates:
- Added new creative features to the mobile build: collectibles (energy orbs), jetpack power-up, breakable platforms, combo meter, and visual sparkles/boost trails.

Updates:
- Added expo-dev-client dependency and iOS bundle identifier to support local dev builds on device.

Updates:
- YOLO feature pack: enemy drones, shield power-up, wind gust zones, shield aura, and HUD badges. New assets: enemy_drone.png + shield.png.

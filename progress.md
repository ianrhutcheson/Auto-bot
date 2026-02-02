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

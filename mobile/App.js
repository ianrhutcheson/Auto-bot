import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Accelerometer } from 'expo-sensors';

const GAME_WIDTH = 480;
const GAME_HEIGHT = 800;

const SETTINGS = {
  gravity: 2200,
  moveSpeed: 320,
  jumpVelocity: 900,
  springVelocity: 1350,
  scrollThreshold: GAME_HEIGHT * 0.4,
  platformWidth: 110,
  platformHeight: 22,
  platformGapMin: 70,
  platformGapMax: 130,
  maxPlatforms: 14,
};

const playerSheet = require('./assets/game/player_sheet.png');
const platformImg = require('./assets/game/platform.png');
const platformMovingImg = require('./assets/game/platform_moving.png');
const springImg = require('./assets/game/spring.png');
const backgroundImg = require('./assets/game/background.png');
const orbImg = require('./assets/game/orb.png');
const jetpackImg = require('./assets/game/jetpack.png');
const enemyImg = require('./assets/game/enemy_drone.png');
const shieldImg = require('./assets/game/shield.png');

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function createInitialState() {
  return {
    mode: 'menu',
    score: 0,
    best: 0,
    time: 0,
    player: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 120,
      vx: 0,
      vy: 0,
      w: 62,
      h: 68,
      squashTimer: 0,
      blinkTimer: 0,
      nextBlinkTime: 0,
    },
    platforms: [],
    collectibles: [],
    enemies: [],
    gusts: [],
    puffs: [],
    streaks: [],
    pointerActive: false,
    pointerX: GAME_WIDTH / 2,
    tiltX: 0,
    combo: 0,
    comboTimer: 0,
    jetpackTime: 0,
    jetpackTrailTimer: 0,
    shieldTime: 0,
  };
}

function Sprite({ frameIndex, size, sheetSource, sheetSize }) {
  const cols = 2;
  const rows = 2;
  const frameW = sheetSize.width / cols;
  const frameH = sheetSize.height / rows;
  const scale = size / frameW;
  const translateX = -(frameIndex % cols) * frameW * scale;
  const translateY = -Math.floor(frameIndex / cols) * frameH * scale;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={sheetSource}
        style={{
          width: sheetSize.width * scale,
          height: sheetSize.height * scale,
          transform: [{ translateX }, { translateY }],
        }}
      />
    </View>
  );
}

export default function App() {
  const [, forceRender] = useState(0);
  const stateRef = useRef(createInitialState());
  const rngRef = useRef(mulberry32(428202));
  const lastTimeRef = useRef(0);

  const sheetSize = useMemo(() => {
    const resolved = Image.resolveAssetSource(playerSheet);
    return { width: resolved.width, height: resolved.height };
  }, []);

  const [screen, setScreen] = useState(Dimensions.get('window'));
  const tiltEnabled = true;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreen(window);
    });
    return () => sub.remove();
  }, []);

  const scale = Math.min(screen.width / GAME_WIDTH, screen.height / GAME_HEIGHT, 1);

  const randRange = (min, max) => min + (max - min) * rngRef.current();

  const createPlatform = (y) => {
    const type = rngRef.current() < 0.22 ? 'moving' : 'static';
    const width = SETTINGS.platformWidth;
    return {
      x: randRange(20, GAME_WIDTH - width - 20),
      y,
      w: width,
      h: SETTINGS.platformHeight,
      type,
      vx: type === 'moving' ? randRange(50, 110) * (rngRef.current() > 0.5 ? 1 : -1) : 0,
      hasSpring: rngRef.current() < 0.15,
      springUsed: false,
      breakable: type === 'static' && rngRef.current() < 0.2,
      breaking: false,
      breakTimer: 0,
    };
  };

  const initGame = () => {
    const state = stateRef.current;
    state.score = 0;
    state.time = 0;
    state.player.x = GAME_WIDTH / 2;
    state.player.y = GAME_HEIGHT - 120;
    state.player.vx = 0;
    state.player.vy = -SETTINGS.jumpVelocity * 0.7;
    state.player.squashTimer = 0;
    state.player.blinkTimer = 0;
    state.player.nextBlinkTime = randRange(1.6, 3.2);
    state.platforms = [];
    state.collectibles = [];
    state.enemies = [];
    state.gusts = [];
    state.puffs = [];
    state.streaks = [];
    state.combo = 0;
    state.comboTimer = 0;
    state.jetpackTime = 0;
    state.jetpackTrailTimer = 0;
    state.shieldTime = 0;

    let y = GAME_HEIGHT - 40;
    while (state.platforms.length < SETTINGS.maxPlatforms) {
      const gap = randRange(SETTINGS.platformGapMin, SETTINGS.platformGapMax);
      y -= gap;
      const platform = createPlatform(y);
      state.platforms.push(platform);
      spawnCollectible(platform);
      spawnEnemy(platform);
      spawnGust(platform);
    }
  };

  const spawnPuff = (platform) => {
    const state = stateRef.current;
    const count = 4 + Math.floor(rngRef.current() * 3);
    const baseX = platform.x + platform.w / 2;
    const baseY = platform.y + 2;
    for (let i = 0; i < count; i += 1) {
      const angle = randRange(-Math.PI, 0);
      const speed = randRange(30, 90);
      state.puffs.push({
        x: baseX + randRange(-18, 18),
        y: baseY + randRange(-4, 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5 - randRange(10, 40),
        r: randRange(4, 9),
        life: randRange(0.35, 0.55),
        maxLife: randRange(0.35, 0.55),
        color: '255,255,255',
      });
    }
  };

  const spawnBoostStreaks = (player, color = '120,216,255') => {
    const state = stateRef.current;
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      state.streaks.push({
        x: player.x + randRange(-10, 10),
        y: player.y + player.h * 0.35,
        vx: randRange(-40, 40),
        vy: randRange(220, 360),
        life: randRange(0.22, 0.36),
        maxLife: randRange(0.22, 0.36),
        length: randRange(10, 22),
        color,
        width: 2,
      });
    }
  };

  const spawnSparkle = (x, y) => {
    const state = stateRef.current;
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = randRange(-Math.PI, Math.PI);
      const speed = randRange(40, 120);
      state.puffs.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: randRange(3, 6),
        life: randRange(0.25, 0.4),
        maxLife: randRange(0.25, 0.4),
        color: '120,216,255',
      });
    }
  };

  const spawnCollectible = (platform) => {
    const state = stateRef.current;
    const roll = rngRef.current();
    if (roll < 0.06) {
      state.collectibles.push({
        type: 'jetpack',
        x: platform.x + platform.w / 2,
        y: platform.y - 42,
        r: 20,
      });
    } else if (roll < 0.14) {
      state.collectibles.push({
        type: 'shield',
        x: platform.x + platform.w / 2,
        y: platform.y - 36,
        r: 16,
      });
    } else if (roll < 0.32) {
      state.collectibles.push({
        type: 'orb',
        x: platform.x + platform.w / 2,
        y: platform.y - 30,
        r: 14,
      });
    }
  };

  const spawnEnemy = (platform) => {
    const state = stateRef.current;
    if (rngRef.current() > 0.16) return;
    state.enemies.push({
      x: randRange(40, GAME_WIDTH - 40),
      y: platform.y - randRange(80, 160),
      r: 18,
      vx: randRange(40, 90) * (rngRef.current() > 0.5 ? 1 : -1),
    });
  };

  const spawnGust = (platform) => {
    const state = stateRef.current;
    if (rngRef.current() > 0.12) return;
    state.gusts.push({
      x: randRange(30, GAME_WIDTH - 90),
      y: platform.y - randRange(40, 140),
      width: randRange(60, 90),
      height: randRange(120, 180),
      force: randRange(120, 220) * (rngRef.current() > 0.5 ? 1 : -1),
      phase: randRange(0, Math.PI * 2),
    });
  };

  const checkLanding = (player, platform, dt) => {
    const playerBottom = player.y + player.h / 2;
    const prevBottom = playerBottom - player.vy * dt;
    const platformTop = platform.y;

    const withinX =
      player.x + player.w / 2 > platform.x + 6 &&
      player.x - player.w / 2 < platform.x + platform.w - 6;

    const crossed = prevBottom <= platformTop && playerBottom >= platformTop;

    return withinX && crossed;
  };

  const wrapPlayer = (player) => {
    if (player.x < -player.w / 2) {
      player.x = GAME_WIDTH + player.w / 2;
    } else if (player.x > GAME_WIDTH + player.w / 2) {
      player.x = -player.w / 2;
    }
  };

  const update = (dt) => {
    const state = stateRef.current;
    if (state.mode !== 'playing') {
      return;
    }

    state.time += dt;
    const player = state.player;

    if (player.blinkTimer > 0) {
      player.blinkTimer = Math.max(0, player.blinkTimer - dt);
    }
    if (state.time >= player.nextBlinkTime) {
      player.blinkTimer = 0.12;
      player.nextBlinkTime = state.time + randRange(2.4, 4.6);
    }

    const moveDirection = (() => {
      const center = GAME_WIDTH / 2;
      if (state.pointerActive) {
        const normalized = clamp((state.pointerX - center) / (GAME_WIDTH / 2), -1, 1);
        return Math.abs(normalized) < 0.08 ? 0 : normalized;
      }
      if (tiltEnabled) {
        const raw = clamp(state.tiltX, -1, 1);
        const curved = Math.sign(raw) * Math.pow(Math.abs(raw), 0.7);
        const normalized = clamp(curved * 1.9, -1, 1);
        return Math.abs(normalized) < 0.03 ? 0 : normalized;
      }
      return 0;
    })();

    player.vx = moveDirection * SETTINGS.moveSpeed;
    player.vy += SETTINGS.gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    wrapPlayer(player);

    for (const platform of state.platforms) {
      if (platform.type === 'moving') {
        platform.x += platform.vx * dt;
        if (platform.x <= 12 || platform.x + platform.w >= GAME_WIDTH - 12) {
          platform.vx *= -1;
          platform.x = clamp(platform.x, 12, GAME_WIDTH - platform.w - 12);
        }
      }
    }

    if (player.vy > 0 && state.jetpackTime <= 0) {
      for (const platform of state.platforms) {
        if (checkLanding(player, platform, dt)) {
          const jumpPower =
            platform.hasSpring && !platform.springUsed
              ? SETTINGS.springVelocity
              : SETTINGS.jumpVelocity;
          if (platform.hasSpring) {
            platform.springUsed = true;
            spawnBoostStreaks(player);
          }
          player.vy = -jumpPower;
          player.squashTimer = 0.12;
          spawnPuff(platform);
          if (platform.breakable && !platform.breaking) {
            platform.breaking = true;
            platform.breakTimer = 0.18;
          }
          if (state.comboTimer > 0) {
            state.combo += 1;
          } else {
            state.combo = 1;
          }
          state.comboTimer = 0.8;
          state.score += 20 + (state.combo - 1) * 10;
          break;
        }
      }
    }

    if (player.y < SETTINGS.scrollThreshold) {
      const diff = SETTINGS.scrollThreshold - player.y;
      player.y = SETTINGS.scrollThreshold;
      for (const platform of state.platforms) {
        platform.y += diff;
      }
      for (const collectible of state.collectibles) {
        collectible.y += diff;
      }
      for (const enemy of state.enemies) {
        enemy.y += diff;
      }
      for (const gust of state.gusts) {
        gust.y += diff;
      }
      for (const puff of state.puffs) {
        puff.y += diff;
      }
      for (const streak of state.streaks) {
        streak.y += diff;
      }
      state.score += diff;
    }

    state.platforms = state.platforms.filter((platform) => {
      if (platform.breaking) {
        platform.breakTimer = Math.max(0, platform.breakTimer - dt);
        if (platform.breakTimer === 0) {
          return false;
        }
      }
      return platform.y < GAME_HEIGHT + 140;
    });

    let minY = Math.min(...state.platforms.map((p) => p.y));
    while (state.platforms.length < SETTINGS.maxPlatforms || minY > -200) {
      const gap = randRange(SETTINGS.platformGapMin, SETTINGS.platformGapMax);
      const nextY = minY - gap;
      const platform = createPlatform(nextY);
      state.platforms.push(platform);
      spawnCollectible(platform);
      spawnEnemy(platform);
      spawnGust(platform);
      minY = nextY;
    }

    if (player.y > GAME_HEIGHT + 120) {
      state.best = Math.max(state.best, Math.floor(state.score));
      state.mode = 'gameover';
    }

    if (player.squashTimer > 0) {
      player.squashTimer = Math.max(0, player.squashTimer - dt);
    }

    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer === 0) {
        state.combo = 0;
      }
    }

    if (state.jetpackTime > 0) {
      state.jetpackTime = Math.max(0, state.jetpackTime - dt);
      player.vy = -1200;
      state.jetpackTrailTimer -= dt;
      if (state.jetpackTrailTimer <= 0) {
        spawnBoostStreaks(player, '150,220,255');
        state.jetpackTrailTimer = 0.12;
      }
    }

    if (state.shieldTime > 0) {
      state.shieldTime = Math.max(0, state.shieldTime - dt);
    }

    state.puffs = state.puffs.filter((puff) => {
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.vy += 120 * dt;
      puff.vx *= 0.98;
      return puff.life > 0;
    });

    state.collectibles = state.collectibles.filter((collectible) => {
      const dx = player.x - collectible.x;
      const dy = player.y - collectible.y;
      const dist = Math.hypot(dx, dy);
      const radius = collectible.r + player.w * 0.35;
      if (dist < radius) {
        if (collectible.type === 'orb') {
          state.score += 150;
          spawnSparkle(collectible.x, collectible.y);
        } else if (collectible.type === 'jetpack') {
          state.jetpackTime = 1.8;
          state.jetpackTrailTimer = 0;
          spawnBoostStreaks(player, '150,220,255');
        } else if (collectible.type === 'shield') {
          state.shieldTime = 6;
          spawnSparkle(collectible.x, collectible.y);
        }
        return false;
      }
      return collectible.y < GAME_HEIGHT + 120;
    });

    state.enemies = state.enemies.filter((enemy) => {
      enemy.x += enemy.vx * dt;
      if (enemy.x < 30 || enemy.x > GAME_WIDTH - 30) {
        enemy.vx *= -1;
        enemy.x = clamp(enemy.x, 30, GAME_WIDTH - 30);
      }
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < enemy.r + player.w * 0.28) {
        if (state.jetpackTime > 0) {
          spawnSparkle(enemy.x, enemy.y);
          state.score += 120;
          return false;
        }
        if (state.shieldTime > 0) {
          state.shieldTime = 0;
          spawnSparkle(enemy.x, enemy.y);
          return false;
        }
        state.best = Math.max(state.best, Math.floor(state.score));
        state.mode = 'gameover';
        return false;
      }
      return enemy.y < GAME_HEIGHT + 160;
    });

    for (const gust of state.gusts) {
      if (
        player.x > gust.x - 10 &&
        player.x < gust.x + gust.width + 10 &&
        player.y > gust.y &&
        player.y < gust.y + gust.height
      ) {
        player.x += gust.force * dt;
      }
    }

    wrapPlayer(player);

    state.gusts = state.gusts.filter((gust) => gust.y < GAME_HEIGHT + 200);

    state.streaks = state.streaks.filter((streak) => {
      streak.life -= dt;
      streak.x += streak.vx * dt;
      streak.y += streak.vy * dt;
      streak.vy += 40 * dt;
      return streak.life > 0;
    });
  };

  useEffect(() => {
    initGame();
    const loop = (timestamp) => {
      const last = lastTimeRef.current || timestamp;
      const dt = Math.min((timestamp - last) / 1000, 0.033);
      lastTimeRef.current = timestamp;
      update(dt);
      forceRender((tick) => tick + 1);
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!tiltEnabled) return undefined;
    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x }) => {
      const state = stateRef.current;
      state.tiltX = lerp(state.tiltX, clamp(x, -1, 1), 0.25);
    });
    return () => sub && sub.remove();
  }, [tiltEnabled]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const state = stateRef.current;
          const x = evt.nativeEvent.locationX / scale;
          state.pointerActive = true;
          state.pointerX = x;
        },
        onPanResponderMove: (evt) => {
          const state = stateRef.current;
          const x = evt.nativeEvent.locationX / scale;
          state.pointerActive = true;
          state.pointerX = x;
        },
        onPanResponderRelease: () => {
          const state = stateRef.current;
          state.pointerActive = false;
        },
      }),
    [scale]
  );

  const state = stateRef.current;
  const player = state.player;
  const frameIndex = (() => {
    if (player.blinkTimer > 0) return 1;
    if (player.vy < -160) return 2 + (Math.floor(state.time * 12) % 2);
    return 0;
  })();

  const bob = Math.sin(state.time * 6) * 2.5;
  const tilt = clamp(player.vx / SETTINGS.moveSpeed, -1, 1) * 0.22;
  const riseFactor = clamp(-player.vy / 1600, 0, 0.14);
  const fallFactor = clamp(player.vy / 1600, 0, 0.12);
  const squashProgress = player.squashTimer / 0.12;
  const stretchY = 1 + riseFactor * 0.9 - fallFactor * 0.35 - squashProgress * 0.15;
  const stretchX = 1 - riseFactor * 0.4 + fallFactor * 0.45 + squashProgress * 0.22;

  const showMenu = state.mode === 'menu';
  const showGameOver = state.mode === 'gameover';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View
          style={[
            styles.gameWrapper,
            {
              width: GAME_WIDTH,
              height: GAME_HEIGHT,
              transform: [{ scale }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <ImageBackground source={backgroundImg} style={styles.background} resizeMode="cover">
            <View style={styles.hud}>
              <Text style={styles.hudText}>Score: {Math.floor(state.score)}</Text>
              <Text style={styles.hudText}>Best: {state.best}</Text>
            </View>
            {state.combo > 1 && (
              <View style={styles.comboBadge}>
                <Text style={styles.comboText}>Combo x{state.combo}</Text>
              </View>
            )}
            {state.jetpackTime > 0 && (
              <View style={styles.powerBadge}>
                <Text style={styles.powerText}>JETPACK</Text>
              </View>
            )}
            {state.shieldTime > 0 && (
              <View style={[styles.powerBadge, { top: 82, backgroundColor: 'rgba(120,210,255,0.9)' }]}>
                <Text style={styles.powerText}>SHIELD</Text>
              </View>
            )}

            {state.platforms.map((platform, index) => (
              <View key={`platform-${index}`} style={{ position: 'absolute', left: platform.x, top: platform.y }}>
                <Image
                  source={platform.type === 'moving' ? platformMovingImg : platformImg}
                  style={{
                    width: platform.w,
                    height: platform.h,
                    opacity: platform.breaking ? clamp(platform.breakTimer / 0.18, 0.1, 1) : 1,
                  }}
                />
                {platform.breakable && !platform.breaking && (
                  <View
                    style={{
                      position: 'absolute',
                      left: platform.w * 0.2,
                      top: platform.h * 0.35,
                      width: platform.w * 0.6,
                      height: 2,
                      backgroundColor: 'rgba(0,0,0,0.18)',
                      borderRadius: 999,
                    }}
                  />
                )}
                {platform.hasSpring && !platform.springUsed && (
                  <Image
                    source={springImg}
                    style={{
                      position: 'absolute',
                      width: 24,
                      height: 26,
                      left: platform.w / 2 - 12,
                      top: -22,
                    }}
                  />
                )}
              </View>
            ))}

            {state.collectibles.map((collectible, index) => {
              const size =
                collectible.type === 'jetpack' ? 40 : collectible.type === 'shield' ? 34 : 28;
              const source =
                collectible.type === 'jetpack'
                  ? jetpackImg
                  : collectible.type === 'shield'
                  ? shieldImg
                  : orbImg;
              return (
                <Image
                  key={`collectible-${index}`}
                  source={source}
                  style={{
                    position: 'absolute',
                    width: size,
                    height: size,
                    left: collectible.x - size / 2,
                    top: collectible.y - size / 2,
                  }}
                />
              );
            })}

            {state.enemies.map((enemy, index) => (
              <Image
                key={`enemy-${index}`}
                source={enemyImg}
                style={{
                  position: 'absolute',
                  width: enemy.r * 2,
                  height: enemy.r * 2,
                  left: enemy.x - enemy.r,
                  top: enemy.y - enemy.r,
                }}
              />
            ))}

            {state.gusts.map((gust, index) => {
              const alpha = 0.12 + 0.08 * Math.sin(state.time * 3 + gust.phase);
              return (
                <View
                  key={`gust-${index}`}
                  style={{
                    position: 'absolute',
                    left: gust.x,
                    top: gust.y,
                    width: gust.width,
                    height: gust.height,
                    borderRadius: 999,
                    backgroundColor: `rgba(140,200,255,${alpha})`,
                  }}
                />
              );
            })}

            {state.puffs.map((puff, index) => (
              <View
                key={`puff-${index}`}
                style={{
                  position: 'absolute',
                  left: puff.x - puff.r,
                  top: puff.y - puff.r,
                  width: puff.r * 2,
                  height: puff.r * 2,
                  borderRadius: puff.r,
                  backgroundColor: `rgba(${puff.color},${0.32 * clamp(puff.life / puff.maxLife, 0, 1)})`,
                }}
              />
            ))}

            {state.streaks.map((streak, index) => {
              const alpha = clamp(streak.life / streak.maxLife, 0, 1);
              const angle = Math.atan2(streak.vy, streak.vx) - Math.PI / 2;
              return (
                <View
                  key={`streak-${index}`}
                  style={{
                    position: 'absolute',
                    left: streak.x - (streak.width || 2) / 2,
                    top: streak.y - streak.length,
                    width: streak.width || 2,
                    height: streak.length,
                    backgroundColor: `rgba(${streak.color || '120,216,255'},${0.65 * alpha})`,
                    borderRadius: 999,
                    transform: [{ rotate: `${angle}rad` }],
                  }}
                />
              );
            })}

            <View
              style={{
                position: 'absolute',
                left: player.x - player.w / 2,
                top: player.y - player.h / 2 + bob,
                width: player.w,
                height: player.h,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [
                  { rotate: `${tilt}rad` },
                  { scaleX: stretchX },
                  { scaleY: stretchY },
                ],
              }}
            >
              <Sprite
                frameIndex={frameIndex}
                size={player.w}
                sheetSource={playerSheet}
                sheetSize={sheetSize}
              />
              {state.shieldTime > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    width: player.w * 1.4,
                    height: player.w * 1.4,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: 'rgba(120,210,255,0.8)',
                    opacity: 0.6 + 0.2 * Math.sin(state.time * 6),
                  }}
                />
              )}
            </View>

            {showMenu && (
              <View style={styles.overlay}>
                <View style={styles.panel}>
                  <Text style={styles.title}>Doodle Jump Pro</Text>
                  <Text style={styles.subtitle}>Tilt or touch left/right to move</Text>
                  <Text style={styles.subtitle}>Jump happens on platforms</Text>
                  <Text style={styles.subtitle}>Collect orbs + grab jetpacks + shields</Text>
                  <Text style={styles.subtitle}>Avoid drones and surf wind gusts</Text>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                      stateRef.current.mode = 'playing';
                      initGame();
                    }}
                  >
                    <Text style={styles.buttonText}>Start</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {showGameOver && (
              <View style={styles.overlay}>
                <View style={styles.panel}>
                  <Text style={styles.title}>Game Over</Text>
                  <Text style={styles.subtitle}>Score: {Math.floor(state.score)}</Text>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                      stateRef.current.mode = 'playing';
                      initGame();
                    }}
                  >
                    <Text style={styles.buttonText}>Play Again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ImageBackground>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#05070f',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05070f',
  },
  gameWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(120,140,255,0.35)',
  },
  background: {
    flex: 1,
  },
  hud: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 4,
  },
  hudText: {
    color: '#f5f7ff',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 6,
  },
  comboBadge: {
    position: 'absolute',
    top: 52,
    left: 16,
    backgroundColor: 'rgba(127,139,255,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  comboText: {
    color: '#071021',
    fontWeight: '700',
    fontSize: 12,
  },
  powerBadge: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(79,211,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  powerText: {
    color: '#071021',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,11,22,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  panel: {
    backgroundColor: 'rgba(18,23,45,0.9)',
    borderRadius: 16,
    padding: 24,
    width: '78%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(120,140,255,0.35)',
  },
  title: {
    color: '#f5f7ff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: 'rgba(245,247,255,0.8)',
    fontSize: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#7f8bff',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
  },
  buttonText: {
    color: '#071021',
    fontWeight: '700',
  },
});

import { canvas, ctx, themeColor, getAlienSprite, drawSprite, triggerShake } from '../renderer.js';
import { audio } from '../audio.js';
import { state } from '../state.js';
import { ALIEN_TYPES, ELITE_TYPES, pickAlienType } from '../config.js';
import { createExplosion, spawnFloatingText } from './particle.js';
import { updatePowerUpUI } from './powerup.js';
import { player, playerInvincible, respawnPlayer } from './player.js';
import { updateBoss, drawBoss, spawnBoss } from './boss.js';
import { updateUI } from '../systems/screens.js';

let nextLevelFn = () => {};
export function setNextLevelFn(fn) { nextLevelFn = fn; }

let endGameFn = () => {};
export function setEndGameFn(fn) { endGameFn = fn; }

function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

export function getLevelConfig(level) {
    const configs = [
        { rows: 3, cols: 6, speed: 16, shootBase: 3.2 },
        { rows: 3, cols: 7, speed: 20, shootBase: 2.8 },
        { rows: 4, cols: 7, speed: 24, shootBase: 2.4 },
        { rows: 4, cols: 8, speed: 28, shootBase: 2.0 },
        { rows: 5, cols: 8, speed: 34, shootBase: 1.6 },
    ];
    const idx = Math.min(level - 1, configs.length - 1);
    const base = configs[idx];
    const extra = Math.max(0, level - configs.length);
    return {
        rows: base.rows,
        cols: base.cols,
        speed: Math.min(48, base.speed + extra * 2),
        shootBase: Math.max(0.15, base.shootBase - extra * 0.18)
    };
}

export function createAliens() {
    // Boss every 3rd level starting at level 3
    if (state.level >= 3 && (state.level - 3) % 3 === 0) {
        state.boss = null;
        spawnBoss();
        state.aliens = [];
        state.levelConfig = { rows: 0, cols: 0, speed: 0, shootBase: 0.5 };
        return;
    }
    state.boss = null;
    state.aliens = [];
    state.levelConfig = getLevelConfig(state.level);
    const cols = state.levelConfig.cols;
    const rows = state.levelConfig.rows;
    const alienWidth = 22;
    const alienHeight = 16;
    const padding = 15;
    const startX = (canvas.width - (cols * (alienWidth + padding) - padding)) / 2;
    const startY = Math.min(45 + (state.level - 1) * 5, 85);

    const colors = themeColor('alienRows');

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const typeKey = pickAlienType(state.level);
            const typeData = ALIEN_TYPES[typeKey];
            state.aliens.push({
                x: startX + c * (alienWidth + padding),
                y: startY + r * (alienHeight + padding),
                width: alienWidth,
                height: alienHeight,
                color: colors[r % colors.length],
                points: Math.floor((rows - r) * 10 * typeData.pointsMult),
                alive: true,
                special: false,
                type: typeKey,
                hp: typeData.hp + Math.min(state.loopCount, 4),
                maxHp: typeData.hp + Math.min(state.loopCount, 4),
                zigzag: typeData.zigzag,
                zigzagPhase: Math.random() * Math.PI * 2,
                hitFlash: 0,
                diving: false,
                diveSpeed: 0,
                telegraphTimer: 0,
                telegraphType: null,
                elite: null,
                shieldHp: 0
            });
        }
    }

    // Pick one random alien to be the special power-up carrier
    const aliveIndices = state.aliens.map((a, i) => i);
    const specialIdx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    state.aliens[specialIdx].special = true;
    state.aliens[specialIdx].points += 20; // Bonus points for special alien

    // Roll elites (~15% base chance, increased in loops)
    const eliteRate = Math.min(0.15 + state.loopCount * 0.05, 0.80);
    const eliteKeys = Object.keys(ELITE_TYPES);
    for (let a of state.aliens) {
        if (Math.random() < eliteRate) {
            const eliteKey = eliteKeys[Math.floor(Math.random() * eliteKeys.length)];
            a.elite = eliteKey;
            a.points = Math.floor(a.points * ELITE_TYPES[eliteKey].pointsMult);
            if (eliteKey === 'SHIELDED') {
                a.shieldHp = 1;
            }
        }
    }

    state.alienSpeed = state.levelConfig.speed;

    // (removed rapid start — now purchased as instant rapid fire in shop)
}

export function updateAliens(dt) {
    if (state.boss) {
        updateBoss(dt);
    } else {
    const aliveAliens = state.aliens.filter(a => a.alive);
    if (aliveAliens.length === 0 && !state.levelTransitioning) {
        nextLevelFn();
        return;
    }

    // Hazard event scheduler
    if (!state.eventTriggeredThisLevel && state.level >= 2 && !state.boss && !state.levelTransitioning) {
        const timeInLevel = (state.levelConfig.rows * state.levelConfig.cols - aliveAliens.length) * 0.5; // rough proxy
        if (timeInLevel > 2 && Math.random() < 0.008) { // ~25% chance over a typical level
            state.eventTriggeredThisLevel = true;
            const roll = Math.random();
            if (roll < 0.40) {
                state.activeEvent = { type: 'METEOR', timer: 10 };
                const count = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < count; i++) {
                    state.meteors.push({
                        x: Math.random() * canvas.width,
                        y: -30 - Math.random() * 100,
                        size: 20 + Math.random() * 20,
                        hp: 2 + Math.floor(Math.random() * 2),
                        speed: 80 + Math.random() * 60,
                        angle: (Math.random() - 0.5) * 0.6,
                        alive: true
                    });
                }
            } else if (roll < 0.70) {
                state.activeEvent = { type: 'EMP', timer: 2.5 };
                state.empActive = true;
                state.empTimer = 2.5;
            } else {
                state.activeEvent = { type: 'REINFORCEMENT', timer: 0 };
                const reinforceCount = 4 + Math.floor(Math.random() * 3);
                const rColors = themeColor('alienRows');
                const rWidth = 22, rPadding = 15;
                const rStartX = (canvas.width - (reinforceCount * (rWidth + rPadding) - rPadding)) / 2;
                for (let i = 0; i < reinforceCount; i++) {
                    state.aliens.push({
                        x: rStartX + i * (rWidth + rPadding),
                        y: -20,
                        width: 22, height: 16,
                        color: rColors[0],
                        points: 10,
                        alive: true,
                        special: false,
                        type: 'NORMAL',
                        hp: 1, maxHp: 1,
                        zigzag: false,
                        zigzagPhase: 0,
                        hitFlash: 0,
                        diving: false,
                        diveSpeed: 0,
                        telegraphTimer: 0,
                        telegraphType: null,
                        elite: null,
                        shieldHp: 0,
                        parachute: true,
                        parachuteTargetY: Math.min(45 + (state.level - 1) * 5, 85) - 20
                    });
                }
            }
        }
    }

    // Update active event
    if (state.activeEvent) {
        state.activeEvent.timer -= dt;
        if (state.activeEvent.type === 'EMP') {
            state.empTimer -= dt;
            if (state.empTimer <= 0) {
                state.empActive = false;
                state.activeEvent = null;
            }
        } else if (state.activeEvent.type === 'METEOR') {
            if (state.activeEvent.timer <= 0 || state.meteors.filter(m => m.alive).length === 0) {
                state.activeEvent = null;
                state.meteors = [];
            }
        } else if (state.activeEvent.type === 'REINFORCEMENT') {
            if (!state.aliens.some(a => a.parachute)) {
                state.activeEvent = null;
            }
        }
    }

    let shouldDrop = false;
    const edgeMargin = 10;

    for (let alien of aliveAliens) {
        if (state.alienDirection === 1 && alien.x + alien.width >= canvas.width - edgeMargin) {
            shouldDrop = true;
            break;
        }
        if (state.alienDirection === -1 && alien.x <= edgeMargin) {
            shouldDrop = true;
            break;
        }
    }

    state.alienMoveTimer += dt;
    const moveInterval = Math.max(0.05, 0.92 - (aliveAliens.length / 70) - (state.level * 0.015));

    if (!state.empActive && state.alienMoveTimer >= moveInterval) {
        state.alienMoveTimer = 0;
        if (shouldDrop) {
            state.alienDirection *= -1;
            aliveAliens.forEach(a => { a.y += state.alienDropDistance; });
        } else {
            aliveAliens.forEach(a => { a.x += state.alienDirection * (state.alienSpeed * 0.5) * (a.elite === 'SPEEDSTER' ? 2.0 : 1.0); });
        }
    }

    // Update parachuting reinforcements
    aliveAliens.forEach(a => {
        if (a.parachute) {
            a.y += 60 * dt;
            if (a.y >= a.parachuteTargetY) {
                a.parachute = false;
            }
        }
    });

    // Update meteors
    for (let i = state.meteors.length - 1; i >= 0; i--) {
        const m = state.meteors[i];
        if (!m.alive) { state.meteors.splice(i, 1); continue; }
        m.y += m.speed * Math.cos(m.angle) * dt;
        m.x += m.speed * Math.sin(m.angle) * dt;
        // Bunker collision
        for (let brick of state.bunkers) {
            if (!brick.alive) continue;
            if (m.x < brick.x + brick.width && m.x + m.size > brick.x &&
                m.y < brick.y + brick.height && m.y + m.size > brick.y) {
                brick.alive = false;
                createExplosion(brick.x + brick.width/2, brick.y + brick.height/2, '#0a0', 5);
                m.alive = false;
                break;
            }
        }
        // Player collision
        if (m.alive && !playerInvincible() &&
            m.x < player.x + player.width && m.x + m.size > player.x &&
            m.y < player.y + player.height && m.y + m.size > player.y) {
            m.alive = false;
            state.wavePerfect = false;
            if (player.shield) {
                delete state.activePowerUps.SHIELD;
                player.shield = false;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#08f', 22);
                audio.playHitShield();
                updatePowerUpUI();
            } else {
                state.aceStreak = 0;
                state.lastDamageTime = 0;
                state.lives--;
                const isFinal = state.lives <= 0;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                audio.playExplosion();
                triggerShake(isFinal ? 14 : 10);
                if (isFinal) {
                    setTimeout(() => endGameFn(), 700);
                } else {
                    respawnPlayer();
                }
            }
            updateUI();
        }
        // Off-screen
        if (m.y > canvas.height + 50 || m.x < -50 || m.x > canvas.width + 50) {
            m.alive = false;
        }
    }

    // Decrement hit flash and process telegraphs (paused during EMP)
    if (!state.empActive) {
    for (let a of aliveAliens) {
        if (a.hitFlash > 0) a.hitFlash -= dt;
        if (a.telegraphTimer > 0) {
            a.telegraphTimer -= dt;
            if (a.telegraphTimer <= 0 && a.alive) {
                if (a.telegraphType === 'bomb') {
                    state.bombs.push({
                        x: a.x + a.width / 2,
                        y: a.y + a.height,
                        width: 4,
                        height: 8,
                        speed: 150 + Math.random() * 100 + state.level * 15,
                        trail: []
                    });
                } else if (a.telegraphType === 'dive') {
                    a.diving = true;
                    a.diveSpeed = (130 + state.level * 12) * (a.elite === 'SPEEDSTER' ? 2.0 : 1.0);
                }
                a.telegraphType = null;
            }
        }
    }
    }

    state.alienShootTimer += dt;
    const totalAliens = state.levelConfig ? state.levelConfig.rows * state.levelConfig.cols : 40;
    const shootInterval = Math.max(0.25, state.levelConfig.shootBase - (totalAliens - aliveAliens.length) * 0.03);
    if (state.alienShootTimer >= shootInterval) {
        state.alienShootTimer = 0;
        // Find bottom-most aliens per column using aliveAliens (works with reinforcements/splitters)
        const shooters = [];
        for (let a of aliveAliens) {
            if (a.width < 20 || a.parachute || a.telegraphTimer > 0) continue;
            const hasAlienBelow = aliveAliens.some(other =>
                other !== a && other.alive &&
                Math.abs(other.x - a.x) < a.width &&
                other.y > a.y
            );
            if (!hasAlienBelow) shooters.push(a);
        }
        if (shooters.length > 0) {
            const shooter = shooters[Math.floor(Math.random() * shooters.length)];
            shooter.telegraphTimer = 0.30;
            shooter.telegraphType = 'bomb';
        }
    }

    // Dive bomber trigger
    const hasDiver = aliveAliens.some(a => a.diving);
    if (!hasDiver && state.level >= 2 && !state.boss) {
        state.diveBomberTimer += dt;
        if (state.diveBomberTimer >= state.diveBomberCooldown) {
            state.diveBomberTimer = 0;
            state.diveBomberCooldown = 6 + Math.random() * 5;
            const candidates = aliveAliens.filter(a => a.type !== 'TANK' && !a.special && a.width >= 20 && a.telegraphTimer <= 0);
            if (candidates.length > 0) {
                const diver = candidates[Math.floor(Math.random() * candidates.length)];
                diver.telegraphTimer = 0.40;
                diver.telegraphType = 'dive';
            }
        }
    }

    // Update dive bombers (paused during EMP)
    if (!state.empActive) {
        aliveAliens.forEach(a => {
            if (a.diving) {
                a.y += a.diveSpeed * dt;
                a.x += (player.x - a.x) * 1.2 * dt;
            }
        });
    }

    // Check dive bomber collisions
    for (let alien of aliveAliens) {
        if (alien.diving) {
            // Hit player directly
            if (rectsOverlap(alien, player) && !playerInvincible()) {
                alien.alive = false;
                createExplosion(alien.x + alien.width/2, alien.y + alien.height/2, '#f00', 20);
                audio.playExplosion();
                triggerShake(10);
                if (player.shield) {
                    delete state.activePowerUps.SHIELD;
                    player.shield = false;
                    updatePowerUpUI();
                } else {
                    state.lives--;
                    state.wavePerfect = false;
                    const isFinal = state.lives <= 0;
                    createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                    audio.playExplosion();
                    triggerShake(isFinal ? 14 : 10);
                    if (isFinal) {
                        setTimeout(() => endGameFn(), 700);
                        return;
                    } else {
                        respawnPlayer();
                    }
                }
                updateUI();
                continue;
            }
            // Off screen
            if (alien.y > canvas.height + 20) {
                alien.alive = false;
            }
        } else if (!playerInvincible() && alien.y + alien.height >= player.y) {
            state.lives = 0;
            state.wavePerfect = false;
            updateUI();
            endGameFn();
        }
    }
    state.aliens = state.aliens.filter(a => a.alive);
    }
}

export function drawAliens() {
    if (state.boss) {
        drawBoss();
    } else {
    const pulse = Math.sin(Date.now() / 150) * 6 + 10;
    state.aliens.forEach(a => {
        if (!a.alive) return;

        // Hit flash overrides color briefly
        if (a.hitFlash > 0) {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 14;
        } else {
            ctx.fillStyle = a.color;
            ctx.shadowColor = a.special ? '#fff' : a.color;
            ctx.shadowBlur = a.special ? pulse : 8;
        }

        const x = a.x, y = a.y, w = a.width, h = a.height;

        // Mini-grunts (from splitter elites) — no sprite, keep procedural
        if (w <= 10) {
            ctx.fillStyle = a.color;
            ctx.fillRect(x, y, w, h * 0.6);
            ctx.fillRect(x + w * 0.2, y + h * 0.6, w * 0.6, h * 0.4);
        } else {
            const sprite = getAlienSprite(a.type);
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                drawSprite(sprite, x, y, w, h);
                ctx.shadowBlur = 0;
            } else {
                // Fallback procedural shapes
                ctx.fillStyle = a.color;
                ctx.shadowColor = a.special ? '#fff' : a.color;
                ctx.shadowBlur = a.special ? pulse : 8;
                if (a.type === 'FAST') {
                    ctx.fillRect(x + w * 0.3, y, w * 0.4, h * 0.35);
                    ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.45);
                    ctx.fillRect(x + w * 0.25, y + h * 0.8, w * 0.15, h * 0.2);
                    ctx.fillRect(x + w * 0.6, y + h * 0.8, w * 0.15, h * 0.2);
                } else if (a.type === 'TANK') {
                    ctx.fillRect(x + w * 0.15, y, w * 0.7, h * 0.35);
                    ctx.fillRect(x, y + h * 0.3, w, h * 0.55);
                    ctx.fillRect(x + w * 0.1, y + h * 0.85, w * 0.25, h * 0.15);
                    ctx.fillRect(x + w * 0.65, y + h * 0.85, w * 0.25, h * 0.15);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
                } else {
                    ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.3);
                    ctx.fillRect(x, y + h * 0.3, w, h * 0.5);
                    ctx.fillRect(x + w * 0.15, y + h * 0.8, w * 0.2, h * 0.2);
                    ctx.fillRect(x + w * 0.65, y + h * 0.8, w * 0.2, h * 0.2);
                }
                ctx.shadowBlur = 0;
            }

            // Hit flash white overlay
            if (a.hitFlash > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillRect(x, y, w, h);
            }

            // Tank HP dots (drawn above sprite)
            if (a.type === 'TANK') {
                const dotColor = a.hp === a.maxHp ? '#0f0' : a.hp === 2 ? '#ff0' : '#f00';
                ctx.fillStyle = dotColor;
                for (let d = 0; d < a.hp; d++) {
                    ctx.fillRect(x + 4 + d * 6, y - 5, 4, 3);
                }
            }

            // Speed lines for fast aliens
            if (a.type === 'FAST') {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(x + w * 0.4, y - 3, w * 0.2, 2);
            }
        }

        // Parachute for reinforcements
        if (a.parachute) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y - 10);
            ctx.lineTo(x + w / 2, y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(x + w / 2, y - 10, 6, Math.PI, 0);
            ctx.fill();
        }

        // Elite aura
        if (a.elite && a.hitFlash <= 0) {
            const eColor = ELITE_TYPES[a.elite].color;
            ctx.strokeStyle = eColor;
            ctx.lineWidth = 2;
            ctx.shadowColor = eColor;
            ctx.shadowBlur = 10;
            ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
            ctx.shadowBlur = 0;
            ctx.fillStyle = eColor;
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(ELITE_TYPES[a.elite].label, x + w / 2, y - 4);
            ctx.textAlign = 'left';
        }

        // Telegraph visuals
        if (a.telegraphTimer > 0 && a.hitFlash <= 0) {
            if (a.telegraphType === 'bomb') {
                const pulse = 0.6 + Math.sin(Date.now() / 40) * 0.4;
                ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
                ctx.beginPath();
                ctx.arc(x + w / 2, y + h + 6, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (a.telegraphType === 'dive') {
                const pulse = 0.7 + Math.sin(Date.now() / 50) * 0.3;
                ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('!', x + w / 2, y - 4);
                ctx.textAlign = 'left';
                ctx.fillStyle = a.color;
                ctx.shadowColor = '#f00';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(x + w/2, y + h/2, w * 0.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // Dive bomber glow
        if (a.diving && a.hitFlash <= 0) {
            ctx.fillStyle = '#f00';
            ctx.shadowColor = '#f00';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(x + w/2, y + h/2, w * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // Trail dots
            ctx.fillStyle = 'rgba(255,0,0,0.4)';
            for (let t = 1; t <= 4; t++) {
                ctx.fillRect(x + w/2 - 1, y + h + t * 5, 2, 2);
            }
        }

        // Special alien marker
        if (a.special && a.hitFlash <= 0 && !a.diving) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
    });
    }
}

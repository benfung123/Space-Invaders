import { state } from '../state.js';
import { COMBO_MAX, WEAPON_TYPES } from '../config.js';
import { player, playerInvincible, respawnPlayer } from '../entities/player.js';
import { createExplosion, spawnFloatingText } from '../entities/particle.js';
import { triggerShake } from '../renderer.js';
import { audio } from '../audio.js';
import { updateUI } from '../systems/screens.js';
import { updatePowerUpUI, spawnWeapon, spawnPowerUp, applyPowerUp, applyWeapon } from '../entities/powerup.js';
import { checkBossRage } from '../entities/boss.js';

// Forward references for game flow functions
let nextLevelFn = () => {};
let endGameFn = () => {};

export function setNextLevelFn(fn) {
    nextLevelFn = fn;
}

export function setEndGameFn(fn) {
    endGameFn = fn;
}

export function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

export function getComboWindow() {
    return 2.2 + state.upgrades.comboBonus * 0.5;
}

export function addComboKill() {
    if (state.comboCount < COMBO_MAX) state.comboCount++;
    state.comboTimer = getComboWindow();
    updateUI();
    if (state.selectedShipKey === 'INTERCEPTOR' && !state.aceActive) {
        state.aceStreak++;
        if (state.aceStreak >= 10) {
            state.aceActive = true;
            state.aceTimer = 2;
            spawnFloatingText(player.x + player.width / 2, player.y - 30, '🔥 ACE TIME!', '#ff0');
            audio.playBonus();
        }
    }
}

export function applySalvoSplash(cx, cy) {
    const radius = 35;
    createExplosion(cx, cy, '#f80', 10);
    triggerShake(2);
    // Splash damage to aliens
    for (let alien of state.aliens) {
        if (!alien.alive) continue;
        const ax = alien.x + alien.width / 2;
        const ay = alien.y + alien.height / 2;
        if (Math.hypot(ax - cx, ay - cy) < radius) {
            if (alien.shieldHp > 0) {
                alien.shieldHp--;
                alien.hitFlash = 0.15;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, '#08f', 6);
            } else {
                alien.hp--;
                alien.hitFlash = 0.12;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color, 4);
            }
            if (alien.hp <= 0) {
                alien.alive = false;
                addComboKill();
                const mult = Math.min(state.comboCount, COMBO_MAX);
                const aceMult = state.aceActive ? 2 : 1;
                const pts = alien.points * mult * (alien.diving ? 2 : 1) * aceMult;
                state.score += pts;
                state.credits += pts;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                audio.playExplosion();
                triggerShake(alien.type === 'TANK' ? 5 : 3);
                if (alien.elite === 'SPLITTER') {
                    for (let s = -1; s <= 1; s += 2) {
                        state.aliens.push({
                            x: alien.x + alien.width / 2 - 4,
                            y: alien.y + alien.height,
                            width: 8, height: 8,
                            color: '#f80',
                            points: 5,
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
                            shieldHp: 0
                        });
                    }
                }
                if (alien.elite === 'CARRIER') {
                    if (Math.random() < 0.5) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                    else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                } else if (alien.special) {
                    if (Math.random() < 0.25) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                    else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                }
                const ftText = mult > 1 ? `+${pts} ×${mult}` : `+${pts}`;
                spawnFloatingText(alien.x + alien.width / 2, alien.y, ftText, alien.special ? '#fff' : alien.color);
                updateUI();
            }
        }
    }
    // Splash damage to minions
    for (let m of state.minions) {
        if (!m.alive) continue;
        const mx = m.x + m.width / 2;
        const my = m.y + m.height / 2;
        if (Math.hypot(mx - cx, my - cy) < radius) {
            m.alive = false;
            addComboKill();
            const mult = Math.min(state.comboCount, COMBO_MAX);
            const aceMult = state.aceActive ? 2 : 1;
            const pts = m.points * mult * aceMult;
            state.score += pts;
            state.credits += pts;
            createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
            audio.playExplosion();
            triggerShake(2);
            spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
            updateUI();
        }
    }
}

export function applyNukeSplash(cx, cy) {
    const radius = 55;
    createExplosion(cx, cy, WEAPON_TYPES.NUKE.color, 14);
    triggerShake(4);
    // Splash damage to aliens
    for (let alien of state.aliens) {
        if (!alien.alive) continue;
        const ax = alien.x + alien.width / 2;
        const ay = alien.y + alien.height / 2;
        if (Math.hypot(ax - cx, ay - cy) < radius) {
            if (alien.shieldHp > 0) {
                alien.shieldHp--;
                alien.hitFlash = 0.15;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, '#08f', 6);
            }
            if (alien.shieldHp <= 0) {
                alien.hp--;
                alien.hitFlash = 0.12;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color, 4);
            }
            if (alien.hp <= 0) {
                alien.alive = false;
                addComboKill();
                const mult = Math.min(state.comboCount, COMBO_MAX);
                const pts = alien.points * mult * (alien.diving ? 2 : 1);
                state.score += pts;
                state.credits += pts;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                audio.playExplosion();
                triggerShake(alien.type === 'TANK' ? 5 : 3);
                if (alien.elite === 'SPLITTER') {
                    for (let s = -1; s <= 1; s += 2) {
                        state.aliens.push({
                            x: alien.x + alien.width / 2 - 4,
                            y: alien.y + alien.height,
                            width: 8, height: 8,
                            color: '#f80',
                            points: 5,
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
                            shieldHp: 0
                        });
                    }
                }
                if (alien.elite === 'CARRIER') {
                    if (Math.random() < 0.5) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                    else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                } else if (alien.special) {
                    if (Math.random() < 0.25) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                    else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                }
                const ftText = mult > 1 ? `+${pts} ×${mult}` : `+${pts}`;
                spawnFloatingText(alien.x + alien.width / 2, alien.y, ftText, alien.special ? '#fff' : alien.color);
                updateUI();
            }
        }
    }
    // Splash damage to minions
    for (let m of state.minions) {
        if (!m.alive) continue;
        const mx = m.x + m.width / 2;
        const my = m.y + m.height / 2;
        if (Math.hypot(mx - cx, my - cy) < radius) {
            m.alive = false;
            addComboKill();
            const mult = Math.min(state.comboCount, COMBO_MAX);
            const pts = m.points * mult;
            state.score += pts;
            state.credits += pts;
            createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
            audio.playExplosion();
            triggerShake(2);
            spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
            updateUI();
        }
    }
    // Splash damage to boss
    if (state.boss) {
        const bx = state.boss.x + state.boss.width / 2;
        const by = state.boss.y + state.boss.height / 2;
        if (Math.hypot(bx - cx, by - cy) < radius + 25) {
            state.boss.hp--;
            checkBossRage();
            createExplosion(cx, cy, '#f80', 6);
            triggerShake(3);
            if (state.boss.hp <= 0) {
                state.score += state.boss.points;
                state.credits += state.boss.points;
                createExplosion(state.boss.x + state.boss.width/2, state.boss.y + state.boss.height/2, '#f00', 40);
                audio.playBonus();
                const typeLabel = state.boss.type === 'DESTROYER' ? 'DESTROYER' : state.boss.type === 'CARRIER' ? 'CARRIER' : 'ARTILLERY';
                spawnFloatingText(state.boss.x + state.boss.width/2, state.boss.y, `${typeLabel} DOWN! +${state.boss.points}`, '#ff0');
                spawnWeapon(state.boss.x + state.boss.width / 2, state.boss.y + state.boss.height);
                state.boss = null;
                audio.stopBGM();
                audio.startBGM();
                updateUI();
                setTimeout(() => { if (state.gameState === 'playing' && !state.levelTransitioning) nextLevelFn(); }, 1000);
            }
        }
    }
}

export function checkCollisions() {
    // Bullets vs aliens & UFO
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        const bulletRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };

        // Aliens
        const isPierce = b.type === 'PIERCE' || b.acePierce;
        const isSalvo = b.type === 'SALVO';
        for (let alien of state.aliens) {
            if (!alien.alive) continue;
            if (rectsOverlap(bulletRect, alien)) {
                // Shielded elite absorbs first hit
                if (alien.shieldHp > 0) {
                    alien.shieldHp--;
                    alien.hitFlash = 0.15;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, '#08f', 6);
                    triggerShake(2);
                    audio.playHitShield();
                    if (!isPierce) {
                        state.bullets.splice(i, 1);
                        break;
                    }
                    continue;
                }
                if (!isPierce) state.bullets.splice(i, 1);
                const isNuke = b.type === 'NUKE';
                if (!isNuke) {
                    alien.hp--;
                    alien.hitFlash = 0.12;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color, 4);
                    triggerShake(alien.type === 'TANK' ? 3 : 2);
                }
                if (isNuke) applyNukeSplash(alien.x + alien.width / 2, alien.y + alien.height / 2);
                // Salvo splash on alien hit
                if (isSalvo) {
                    applySalvoSplash(alien.x + alien.width / 2, alien.y + alien.height / 2);
                }
                if (alien.hp <= 0) {
                    alien.alive = false;
                    addComboKill();
                    const mult = Math.min(state.comboCount, COMBO_MAX);
                    const aceMult = state.aceActive ? 2 : 1;
                    const pts = alien.points * mult * (alien.diving ? 2 : 1) * aceMult;
                    state.score += pts;
                    state.credits += pts;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                    audio.playExplosion();
                    triggerShake(alien.type === 'TANK' ? 5 : 3);
                    // Elite splitter spawns mini-grunts
                    if (alien.elite === 'SPLITTER') {
                        for (let s = -1; s <= 1; s += 2) {
                            state.aliens.push({
                                x: alien.x + alien.width / 2 - 4,
                                y: alien.y + alien.height,
                                width: 8, height: 8,
                                color: '#f80',
                                points: 5,
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
                                shieldHp: 0
                            });
                        }
                    }
                    // Elite carrier guaranteed drop
                    if (alien.elite === 'CARRIER') {
                        if (Math.random() < 0.5) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                        else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                    } else if (alien.special) {
                        if (Math.random() < 0.25) spawnWeapon(alien.x + alien.width / 2, alien.y + alien.height);
                        else spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                    }
                    const ftText = mult > 1 ? `+${pts} ×${mult}` : `+${pts}`;
                    spawnFloatingText(alien.x + alien.width / 2, alien.y, ftText, alien.special ? '#fff' : alien.color);
                    updateUI();
                }
                if (!isPierce) break;
            }
        }

        if (!state.bullets[i]) continue; // Bullet was consumed by alien hit

        // UFO
        if (state.ufo && state.bullets[i]) {
            const ufoRect = { x: state.ufo.x, y: state.ufo.y, width: state.ufo.width, height: state.ufo.height };
            if (rectsOverlap(bulletRect, ufoRect)) {
                if (!isPierce) state.bullets.splice(i, 1);
                if (b.type === 'NUKE') applyNukeSplash(state.ufo.x + state.ufo.width / 2, state.ufo.y + state.ufo.height / 2);
                if (isSalvo) applySalvoSplash(state.ufo.x + state.ufo.width / 2, state.ufo.y + state.ufo.height / 2);
                state.score += state.ufo.points;
                state.credits += state.ufo.points;
                createExplosion(state.ufo.x + state.ufo.width / 2, state.ufo.y + state.ufo.height / 2, '#f0f', 22);
                audio.playBonus();
                triggerShake(4);
                if (Math.random() < 0.3) spawnWeapon(state.ufo.x + state.ufo.width / 2, state.ufo.y + state.ufo.height / 2);
                else spawnPowerUp(state.ufo.x + state.ufo.width / 2, state.ufo.y + state.ufo.height / 2);
                state.ufo = null;
                state.ufoNextSpawn = 8 + Math.random() * 10;
                updateUI();
            }
        }

        // Minions
        for (let m of state.minions) {
            if (!m.alive || !state.bullets[i]) continue;
            const mRect = { x: m.x, y: m.y, width: m.width, height: m.height };
            if (rectsOverlap(bulletRect, mRect)) {
                if (!isPierce) state.bullets.splice(i, 1);
                m.alive = false;
                if (b.type === 'NUKE') applyNukeSplash(m.x + m.width / 2, m.y + m.height / 2);
                if (isSalvo) applySalvoSplash(m.x + m.width / 2, m.y + m.height / 2);
                addComboKill();
                const mult = Math.min(state.comboCount, COMBO_MAX);
                const aceMult = state.aceActive ? 2 : 1;
                const pts = m.points * mult * aceMult;
                state.score += pts;
                state.credits += pts;
                createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
                audio.playExplosion();
                triggerShake(2);
                spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
                updateUI();
                if (!isPierce) break;
            }
        }

        if (!state.bullets[i]) continue; // Bullet was consumed by minion hit

        // Boss
        if (state.boss && state.bullets[i]) {
            const bossRect = { x: state.boss.x, y: state.boss.y, width: state.boss.width, height: state.boss.height };
            if (rectsOverlap(bulletRect, bossRect)) {
                if (!isPierce) state.bullets.splice(i, 1);
                state.boss.hp--;
                checkBossRage();
                const nukeHit = b.type === 'NUKE';
                if (nukeHit) applyNukeSplash(state.boss.x + state.boss.width / 2, state.boss.y + state.boss.height / 2);
                if (isSalvo) applySalvoSplash(state.boss.x + state.boss.width / 2, state.boss.y + state.boss.height / 2);
                createExplosion(b.x, b.y, '#f80', 8);
                triggerShake(3);
                if (state.boss && state.boss.hp <= 0) {
                    state.score += state.boss.points;
                    state.credits += state.boss.points;
                    createExplosion(state.boss.x + state.boss.width/2, state.boss.y + state.boss.height/2, '#f00', 40);
                    audio.playBonus();
                    const typeLabel = state.boss.type === 'DESTROYER' ? 'DESTROYER' : state.boss.type === 'CARRIER' ? 'CARRIER' : 'ARTILLERY';
                    spawnFloatingText(state.boss.x + state.boss.width/2, state.boss.y, `${typeLabel} DOWN! +${state.boss.points}`, '#ff0');
                    spawnWeapon(state.boss.x + state.boss.width / 2, state.boss.y + state.boss.height);
                    state.boss = null;
                    audio.stopBGM();
                    audio.startBGM();
                    updateUI();
                    setTimeout(() => { if (state.gameState === 'playing' && !state.levelTransitioning) nextLevelFn(); }, 1000);
                }
                // Don't break — let other bullets process this frame
            }
        }
    }

    // Minions vs player
    for (let m of state.minions) {
        if (!m.alive) continue;
        if (rectsOverlap(m, player) && !playerInvincible()) {
            m.alive = false;
            createExplosion(m.x + m.width/2, m.y + m.height/2, '#f00', 15);
            audio.playExplosion();
            triggerShake(8);
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
                    break;
                } else {
                    respawnPlayer();
                }
            }
            updateUI();
        }
    }

    // Bombs vs player
    for (let i = state.bombs.length - 1; i >= 0; i--) {
        const b = state.bombs[i];
        const bombRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(bombRect, playerRect) && !playerInvincible()) {
            state.bombs.splice(i, 1);
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
            break;
        }
    }

    // Power-ups vs player
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
        const p = state.powerUps[i];
        const pRect = { x: p.x, y: p.y, width: p.width, height: p.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(pRect, playerRect)) {
            applyPowerUp(p.type);
            state.powerUps.splice(i, 1);
        }
    }

    // Meteors vs player bullets
    for (let m of state.meteors) {
        if (!m.alive) continue;
        const mRect = { x: m.x, y: m.y, width: m.size, height: m.size };
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            const bRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
            if (rectsOverlap(bRect, mRect)) {
                if (b.type !== 'PIERCE') state.bullets.splice(i, 1);
                m.hp--;
                createExplosion(m.x + m.size / 2, m.y + m.size / 2, '#888', 5);
                if (m.hp <= 0) {
                    m.alive = false;
                    createExplosion(m.x + m.size / 2, m.y + m.size / 2, '#aaa', 12);
                    triggerShake(3);
                }
                if (b.type !== 'PIERCE') break;
            }
        }
    }

    // Weapon crates vs player
    for (let i = state.weapons.length - 1; i >= 0; i--) {
        const w = state.weapons[i];
        const wRect = { x: w.x, y: w.y, width: w.width, height: w.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(wRect, playerRect)) {
            applyWeapon(state.weapons[i].type);
            state.weapons.splice(i, 1);
        }
    }
}

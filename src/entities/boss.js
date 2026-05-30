import { canvas, ctx, getBossSprite, drawSprite, triggerShake } from '../renderer.js';
import { audio } from '../audio.js';
import { state } from '../state.js';
import { createExplosion, spawnFloatingText } from './particle.js';
import { updatePowerUpUI } from './powerup.js';
import { player, playerInvincible, respawnPlayer } from './player.js';
import { spawnMinion } from './minion.js';
import { updateUI } from '../systems/screens.js';

let nextLevelFn = () => {};
export function setNextLevelFn(fn) { nextLevelFn = fn; }

let endGameFn = () => {};
export function setEndGameFn(fn) { endGameFn = fn; }

export function getBossType(level) {
    const types = ['DESTROYER', 'CARRIER', 'ARTILLERY'];
    return types[Math.floor((level - 3) / 3) % 3];
}

export function getBossHp(level, type) {
    const base = 25 + (level - 3) * 10;
    const mult = type === 'DESTROYER' ? 2.2 : type === 'CARRIER' ? 1.4 : 1.7;
    return Math.floor(base * mult);
}

export function spawnBoss() {
    const type = getBossType(state.level);
    const hp = getBossHp(state.level, type);
    const base = {
        x: canvas.width / 2 - 70,
        y: 35,
        width: 140,
        height: 70,
        type: type,
        hp: hp,
        maxHp: hp,
        points: 300 + state.level * 80,
        rage: false,
        rageFlash: 0
    };
    const loopSpeedMult = Math.min(1.0 + state.loopCount * 0.2, 2.5);
    if (type === 'DESTROYER') {
        state.boss = {
            ...base,
            speed: (45 + (state.level - 3) * 3) * loopSpeedMult,
            direction: 1,
            shootTimer: 0,
            shootInterval: Math.max(0.1, (1.4 - (state.level - 3) * 0.08) / loopSpeedMult),
            moveTimer: 0,
            phase: 'MOVE',
            phaseTimer: 0,
            laserHitPlayer: false,
            spreadBonus: 0,
            cannonTelegraph: 0
        };
    } else if (type === 'CARRIER') {
        state.boss = {
            ...base,
            speed: 30 * loopSpeedMult,
            direction: 1,
            spawnTimer: 0,
            spawnInterval: Math.max(0.1, (2.0 - (state.level - 3) * 0.06) / loopSpeedMult),
            moveTimer: 0,
            minionCount: 2
        };
    } else {
        state.boss = {
            ...base,
            shootTimer: 0,
            shootInterval: Math.max(0.1, (0.9 - (state.level - 3) * 0.04) / loopSpeedMult),
            burstTimer: 0,
            burstInterval: Math.max(0.1, (4.0 - (state.level - 3) * 0.1) / loopSpeedMult),
            jitterOffset: 0,
            jitterTimer: 0,
            burstCount: 10,
            jitterAmp: 20,
            aimTelegraph: 0,
            aimTargetX: 0
        };
    }
    audio.stopBGM();
    audio.startBGM();
}

export function checkBossRage() {
    if (!state.boss || state.boss.rage || state.boss.hp <= 0) return;
    if (state.boss.hp / state.boss.maxHp <= 0.3) {
        state.boss.rage = true;
        triggerShake(6);
        spawnFloatingText(state.boss.x + state.boss.width / 2, state.boss.y - 20, '😤 ENRAGED!', '#f00');
        audio.playExplosion();
        // Apply rage modifiers
        if (state.boss.type === 'DESTROYER') {
            state.boss.shootInterval = Math.max(0.1, state.boss.shootInterval * 0.67);
            state.boss.spreadBonus = 1;
        } else if (state.boss.type === 'CARRIER') {
            state.boss.spawnInterval = Math.max(0.1, state.boss.spawnInterval * 0.67);
            state.boss.minionCount = 3;
        } else if (state.boss.type === 'ARTILLERY') {
            state.boss.shootInterval = Math.max(0.1, state.boss.shootInterval * 0.67);
            state.boss.burstInterval = Math.max(0.1, state.boss.burstInterval * 0.67);
            state.boss.burstCount = 14;
            state.boss.jitterAmp = 40;
        }
    }
}

export function drawBossRageOverlay(x, y, w, h) {
    if (!state.boss || !state.boss.rage) return;
    const pulse = 0.25 + Math.sin(Date.now() / 80) * 0.15;
    ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
    ctx.fillRect(x, y, w, h);
}

// ===== DESTROYER =====
export function updateBoss_DESTROYER(dt) {
    const b = state.boss;
    b.phaseTimer += dt;

    // Handle cannon telegraph
    if (b.cannonTelegraph > 0) {
        b.cannonTelegraph -= dt;
        if (b.cannonTelegraph <= 0) {
            const spread = Math.min(4, 1 + Math.floor((state.level - 3) / 2)) + (b.spreadBonus || 0);
            for (let s = -spread; s <= spread; s++) {
                state.bombs.push({
                    x: b.x + b.width / 2 + s * 18,
                    y: b.y + b.height,
                    width: 5, height: 10,
                    speed: 160 + Math.random() * 50,
                    trail: []
                });
            }
        }
    }

    if (b.phase === 'MOVE') {
        b.moveTimer += dt;
        if (b.moveTimer >= 0.4) {
            b.moveTimer = 0;
            b.x += b.direction * b.speed * 0.4;
            if (b.x <= 10) { b.direction = 1; b.x = 10; }
            if (b.x + b.width >= canvas.width - 10) { b.direction = -1; b.x = canvas.width - b.width - 10; }
        }
        b.shootTimer += dt;
        if (b.shootTimer >= b.shootInterval && b.cannonTelegraph <= 0) {
            b.shootTimer = 0;
            b.cannonTelegraph = Math.min(0.20, b.shootInterval * 0.5);
        }
        if (b.phaseTimer >= 4.0) {
            b.phase = 'CHARGE';
            b.phaseTimer = 0;
        }
    } else if (b.phase === 'CHARGE') {
        if (b.phaseTimer >= 1.2) {
            b.phase = 'LASER';
            b.phaseTimer = 0;
            b.laserHitPlayer = false;
        }
    } else if (b.phase === 'LASER') {
        const laserY = b.y + b.height * 0.72;
        const laserH = 12;
        if (!b.laserHitPlayer && player.y + player.height >= laserY && player.y <= laserY + laserH) {
            if (player.shield) {
                delete state.activePowerUps.SHIELD;
                player.shield = false;
                b.laserHitPlayer = true;
                updatePowerUpUI();
            } else if (!playerInvincible()) {
                b.laserHitPlayer = true;
                state.aceStreak = 0;
                state.lastDamageTime = 0;
                state.lives--;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#f00', 25);
                audio.playExplosion();
                triggerShake(10);
                if (state.lives <= 0) endGameFn();
                else respawnPlayer();
            }
            updateUI();
        }
        if (b.phaseTimer >= 1.5) {
            b.phase = 'MOVE';
            b.phaseTimer = 0;
            b.laserHitPlayer = false;
        }
    }
}

export function drawBoss_DESTROYER() {
    const x = state.boss.x, y = state.boss.y, w = state.boss.width, h = state.boss.height;
    const sprite = getBossSprite('DESTROYER');
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        drawSprite(sprite, x, y, w, h);
    } else {
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f80';
        ctx.shadowBlur = 20;
        ctx.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, h * 0.45);
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.25, w * 0.38, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ff0';
        ctx.fillRect(x + w * 0.22, y + h * 0.35, w * 0.14, h * 0.12);
        ctx.fillRect(x + w * 0.64, y + h * 0.35, w * 0.14, h * 0.12);
        ctx.fillStyle = '#f80';
        ctx.fillRect(x, y + h * 0.55, w * 0.12, h * 0.3);
        ctx.fillRect(x + w * 0.88, y + h * 0.55, w * 0.12, h * 0.3);
        ctx.fillStyle = '#f00';
        ctx.fillRect(x + w * 0.42, y + h * 0.68, w * 0.16, h * 0.15);
        ctx.shadowBlur = 0;
    }
    drawBossRageOverlay(x, y, w, h);

    // Cannon telegraph
    if (state.boss.cannonTelegraph > 0 && state.boss.phase === 'MOVE') {
        const pulse = 0.5 + Math.sin(Date.now() / 40) * 0.5;
        ctx.fillStyle = `rgba(255, 200, 0, ${pulse})`;
        ctx.fillRect(x + w * 0.05, y + h * 0.55, w * 0.08, h * 0.08);
        ctx.fillRect(x + w * 0.87, y + h * 0.55, w * 0.08, h * 0.08);
    }

    if (state.boss.phase === 'CHARGE') {
        const alpha = 0.3 + Math.sin(Date.now() / 60) * 0.25;
        ctx.strokeStyle = `rgba(255, 255, 0, ${Math.max(0.1, alpha)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y + h * 0.75);
        ctx.lineTo(canvas.width, y + h * 0.75);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (state.boss.phase === 'LASER') {
        ctx.fillStyle = 'rgba(255, 50, 0, 0.7)';
        ctx.shadowColor = '#f80';
        ctx.shadowBlur = 25;
        const beamH = state.boss.rage ? 24 : 12;
        const coreH = state.boss.rage ? 8 : 4;
        ctx.fillRect(0, y + h * 0.72, canvas.width, beamH);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, y + h * 0.74, canvas.width, coreH);
        ctx.shadowBlur = 0;
    }
}

// ===== CARRIER =====
export function updateBoss_CARRIER(dt) {
    const b = state.boss;
    b.moveTimer += dt;
    if (b.moveTimer >= 0.5) {
        b.moveTimer = 0;
        b.x += b.direction * b.speed * 0.5;
        if (b.x <= 10) { b.direction = 1; b.x = 10; }
        if (b.x + b.width >= canvas.width - 10) { b.direction = -1; b.x = canvas.width - b.width - 10; }
    }
    b.spawnTimer += dt;
    if (b.spawnTimer >= b.spawnInterval) {
        b.spawnTimer = 0;
        spawnMinion(b.x + b.width * 0.15, b.y + b.height);
        spawnMinion(b.x + b.width * 0.85, b.y + b.height);
        if (b.minionCount >= 3) {
            spawnMinion(b.x + b.width * 0.5, b.y + b.height);
        }
    }
}

export function drawBoss_CARRIER() {
    const x = state.boss.x, y = state.boss.y, w = state.boss.width, h = state.boss.height;
    const sprite = getBossSprite('CARRIER');
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        drawSprite(sprite, x, y, w, h);
    } else {
        ctx.fillStyle = '#0a0';
        ctx.shadowColor = '#0f0';
        ctx.shadowBlur = 18;
        ctx.fillRect(x + w * 0.05, y + h * 0.3, w * 0.9, h * 0.5);
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.35, w * 0.42, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#030';
        ctx.fillRect(x + w * 0.15, y + h * 0.5, w * 0.18, h * 0.3);
        ctx.fillRect(x + w * 0.67, y + h * 0.5, w * 0.18, h * 0.3);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
        ctx.fillRect(x + w * 0.17, y + h * 0.55, w * 0.14, h * 0.2);
        ctx.fillRect(x + w * 0.69, y + h * 0.55, w * 0.14, h * 0.2);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(x + w * 0.35, y + h * 0.82, w * 0.08, h * 0.12);
        ctx.fillRect(x + w * 0.57, y + h * 0.82, w * 0.08, h * 0.12);
        ctx.shadowBlur = 0;
    }
    drawBossRageOverlay(x, y, w, h);
}

// ===== ARTILLERY =====
export function updateBoss_ARTILLERY(dt) {
    const b = state.boss;
    b.jitterTimer += dt;
    if (b.jitterTimer >= 0.3) {
        b.jitterTimer = 0;
        b.jitterOffset = (Math.random() - 0.5) * (b.jitterAmp || 20);
    }
    b.x = canvas.width / 2 - b.width / 2 + b.jitterOffset;

    // Handle aim telegraph
    if (b.aimTelegraph > 0) {
        b.aimTelegraph -= dt;
        if (b.aimTelegraph <= 0) {
            const targetX = b.aimTargetX;
            for (let offset of [-20, 20]) {
                state.bombs.push({
                    x: b.x + b.width / 2 + offset,
                    y: b.y + b.height,
                    width: 5, height: 10,
                    speed: 140 + Math.random() * 40,
                    dx: (targetX - (b.x + b.width / 2 + offset)) * 0.4,
                    trail: []
                });
            }
        }
    }

    b.shootTimer += dt;
    if (b.shootTimer >= b.shootInterval && b.aimTelegraph <= 0) {
        b.shootTimer = 0;
        b.aimTargetX = player.x + player.width / 2;
        b.aimTelegraph = Math.min(0.20, b.shootInterval * 0.5);
    }

    b.burstTimer += dt;
    if (b.burstTimer >= b.burstInterval) {
        b.burstTimer = 0;
        const count = b.burstCount || 10;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.PI * 0.1;
            state.bombs.push({
                x: b.x + b.width / 2,
                y: b.y + b.height * 0.6,
                width: 4, height: 9,
                speed: 0,
                dx: Math.cos(angle) * 130,
                dy: Math.sin(angle) * 130,
                trail: []
            });
        }
    }
}

export function drawBoss_ARTILLERY() {
    const x = state.boss.x, y = state.boss.y, w = state.boss.width, h = state.boss.height;
    const sprite = getBossSprite('ARTILLERY');
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        drawSprite(sprite, x, y, w, h);
    } else {
        ctx.fillStyle = '#80a';
        ctx.shadowColor = '#f0f';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.6, w * 0.45, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.45);
        ctx.fillStyle = '#f0f';
        const turretW = w * 0.1;
        const turretH = h * 0.25;
        const turretY = y + h * 0.05;
        ctx.fillRect(x + w * 0.25, turretY, turretW, turretH);
        ctx.fillRect(x + w * 0.65, turretY, turretW, turretH);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.35, w * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.35, w * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    drawBossRageOverlay(x, y, w, h);

    // Aim telegraph reticle
    if (state.boss.aimTelegraph > 0) {
        const rx = state.boss.aimTargetX;
        const ry = player.y + player.height / 2;
        const pulse = 0.5 + Math.sin(Date.now() / 40) * 0.5;
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 14, ry);
        ctx.lineTo(rx + 14, ry);
        ctx.moveTo(rx, ry - 14);
        ctx.lineTo(rx, ry + 14);
        ctx.stroke();
    }
}

// ===== DISPATCHERS =====
export function updateBoss(dt) {
    if (!state.boss) return;
    if (state.boss.type === 'DESTROYER') updateBoss_DESTROYER(dt);
    else if (state.boss.type === 'CARRIER') updateBoss_CARRIER(dt);
    else updateBoss_ARTILLERY(dt);

    if (state.boss && !playerInvincible() && state.boss.y + state.boss.height >= player.y) {
        state.lives = 0;
        state.wavePerfect = false;
        updateUI();
        endGameFn();
    }
}

export function drawBoss() {
    if (!state.boss) return;
    drawBossHpBar();
    if (state.boss.type === 'DESTROYER') drawBoss_DESTROYER();
    else if (state.boss.type === 'CARRIER') drawBoss_CARRIER();
    else drawBoss_ARTILLERY();
}

export function drawBossHpBar() {
    if (!state.boss) return;
    const x = state.boss.x, w = state.boss.width;
    const barW = w * 0.7;
    const barH = 7;
    const barX = x + w * 0.15;
    const barY = state.boss.y - 14;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = state.boss.hp > state.boss.maxHp * 0.4 ? '#0f0' : '#f00';
    ctx.fillRect(barX, barY, barW * (state.boss.hp / state.boss.maxHp), barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(state.boss.type, x + w / 2, barY - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

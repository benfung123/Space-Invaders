import { state } from '../state.js';
import { ctx, canvas, getShipSprite, drawSprite, themeColor, triggerShake } from '../renderer.js';
import { SHIP_CLASSES, WEAPON_TYPES } from '../config.js';
import { audio } from '../audio.js';
import { createExplosion, spawnFloatingText } from './particle.js';
import { applyPowerUp } from './powerup.js';

export function getFireRateCooldown() {
    const b = state.upgrades.fireRateBonus;
    return 0.25 * Math.pow(0.8, Math.min(b, 3)) * Math.pow(0.9, Math.max(0, b - 3));
}

export const player = {
    x: 0, y: 0,
    width: 40, height: 25,
    speed: 300,
    color: '#0f0',
    cooldown: 0,
    baseCooldown: 0.25,
    shield: false,
    initTime: 0,

    init() {
        const ship = SHIP_CLASSES[state.selectedShipKey];
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 28;
        this.shield = false;
        this.initTime = 0;
        this.speed = 300 * ship.speedMult * (1 + state.upgrades.speedBonus * 0.2);
        this.baseCooldown = getFireRateCooldown() / ship.fireRateMult;
        this.color = ship.color;
        state.aceStreak = 0;
        state.aceActive = false;
        state.aceTimer = 0;
        state.salvoCounter = 0;
        state.lastDamageTime = 0;
        state.phaseShiftCooldown = 0;
        state.phaseShiftTimer = 0;
        state.lastKeyTapTime = { left: 0, right: 0 };
    },

    getCooldown() {
        return state.activePowerUps.RAPID_FIRE ? 0.07 : this.baseCooldown;
    },

    update(dt) {
        this.initTime += dt;
        if (state.keys['ArrowLeft'] || state.keys['a'] || state.touchInput.left) {
            this.x -= this.speed * dt;
        }
        if (state.keys['ArrowRight'] || state.keys['d'] || state.touchInput.right) {
            this.x += this.speed * dt;
        }
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

        if (this.cooldown > 0) this.cooldown -= dt;
        if (state.touchInput.fire && this.cooldown <= 0) {
            this.shoot();
        }
        this.shield = !!state.activePowerUps.SHIELD;

        if (state.selectedShipKey === 'VANGUARD' && !playerInvincible()) {
            state.lastDamageTime += dt;
            if (state.lastDamageTime >= 6 && !this.shield) {
                applyPowerUp('SHIELD');
                spawnFloatingText(this.x + this.width / 2, this.y - 20, '♻️ REGEN!', '#08f');
            }
        }

        if (state.aceActive) {
            state.aceTimer -= dt;
            if (state.aceTimer <= 0) {
                state.aceActive = false;
                state.aceTimer = 0;
            }
        }

        if (state.phaseShiftTimer > 0) state.phaseShiftTimer -= dt;
        if (state.phaseShiftCooldown > 0) state.phaseShiftCooldown -= dt;
    },

    shoot() {
        if (this.cooldown > 0) return;
        const cx = this.x + this.width / 2;
        const cy = this.y;
        const shipColor = SHIP_CLASSES[state.selectedShipKey].color;
        const acePierce = state.aceActive;
        if (state.activeWeapon === 'SPREAD') {
            const angles = [-260, -130, 0, 130, 260];
            angles.forEach(a => state.bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: WEAPON_TYPES.SPREAD.color, dx: a, trail: [], acePierce }));
        } else if (state.activeWeapon === 'PIERCE') {
            state.bullets.push({ x: cx, y: cy, width: 3, height: 14, speed: 650, color: WEAPON_TYPES.PIERCE.color, dx: 0, trail: [], type: 'PIERCE', acePierce });
        } else if (state.activeWeapon === 'HOMING') {
            state.bullets.push({ x: cx, y: cy, width: 5, height: 10, speed: 420, color: WEAPON_TYPES.HOMING.color, dx: 0, trail: [], type: 'HOMING', acePierce });
        } else if (state.activeWeapon === 'NUKE') {
            state.bullets.push({ x: cx, y: cy, width: 5, height: 14, speed: 480, color: WEAPON_TYPES.NUKE.color, dx: 0, trail: [], type: 'NUKE', acePierce });
        } else if (state.activePowerUps.MULTI_SHOT) {
            state.bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 0, trail: [], acePierce });
            state.bullets.push({ x: cx - 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: -130, trail: [], acePierce });
            state.bullets.push({ x: cx + 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 130, trail: [], acePierce });
        } else {
            if (state.selectedShipKey === 'HARBINGER') {
                state.harbingerShotCounter++;
                if (state.harbingerShotCounter >= 4) {
                    state.harbingerShotCounter = 0;
                    state.singularities.push({ x: cx, y: cy, radius: 50, timer: 2.5, pullForce: 80 });
                } else {
                    state.bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
                }
            } else if (state.selectedShipKey === 'TITAN') {
                state.salvoCounter++;
                if (state.salvoCounter >= 6) {
                    state.salvoCounter = 0;
                    state.bullets.push({ x: cx, y: cy, width: 6, height: 14, speed: 380, color: '#f80', dx: 0, trail: [], type: 'SALVO', acePierce });
                    spawnFloatingText(cx, cy - 15, '💥 SALVO!', '#f80');
                } else {
                    state.bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
                }
            } else {
                state.bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
            }
        }
        audio.playShoot();
        this.cooldown = this.getCooldown();
    },

    draw() {
        if (this.initTime < 2 && Math.floor(this.initTime * 10) % 2 === 0) return;

        if (this.shield) {
            ctx.strokeStyle = '#08f';
            ctx.shadowColor = '#08f';
            ctx.shadowBlur = 15;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.height + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        const sprite = getShipSprite();
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            drawSprite(sprite, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(this.x + this.width / 2, this.y);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.lineTo(this.x, this.y + this.height);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = themeColor('bullet');
            ctx.fillRect(this.x + this.width / 2 - 3, this.y + this.height, 6, 6);
            ctx.shadowBlur = 0;
        }
    }
};

export function playerInvincible() {
    return player.initTime < 2 || (state.selectedShipKey === 'SPECTRE' && state.phaseShiftTimer > 0);
}

export function respawnPlayer() {
    player.initTime = 0;
    player.x = canvas.width / 2 - player.width / 2;
    state.bombs = state.bombs.filter(b => b.y < player.y - 30 || Math.abs(b.x - (player.x + player.width / 2)) > 70);
}

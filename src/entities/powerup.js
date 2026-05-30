import { state } from '../state.js';
import { ctx, canvas, drawSprite, SPRITES } from '../renderer.js';
import { POWERUP_TYPES, WEAPON_TYPES } from '../config.js';
import { audio } from '../audio.js';
import { spawnFloatingText } from './particle.js';
import { SHIP_CLASSES } from '../config.js';

export function spawnPowerUp(x, y) {
    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    state.powerUps.push({
        x: x - 10, y: y,
        width: 20, height: 20,
        type: type,
        speed: 60,
        ...POWERUP_TYPES[type]
    });
}

export function updatePowerUps(dt) {
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
        state.powerUps[i].y += state.powerUps[i].speed * dt;
        if (state.powerUps[i].y > canvas.height) {
            state.powerUps.splice(i, 1);
        }
    }
    for (let type in state.activePowerUps) {
        if (state.activePowerUps[type] > 0) {
            state.activePowerUps[type] -= dt;
            if (state.activePowerUps[type] <= 0) {
                delete state.activePowerUps[type];
                if (type === 'WINGMAN') state.wingmen = [];
            }
        }
    }
}

export function drawPowerUps() {
    state.powerUps.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let symbol = p.type === 'SHIELD' ? 'S' : p.type === 'RAPID_FIRE' ? 'R' : p.type === 'WINGMAN' ? 'W' : 'M';
        ctx.fillText(symbol, p.x + p.width / 2, p.y + p.height / 2 + 1);
    });
}

export function applyPowerUp(type) {
    state.activePowerUps[type] = POWERUP_TYPES[type].duration;
    if (type === 'WINGMAN') createWingmen();
    audio.playPowerUp();
    updatePowerUpUI();
}

export function updatePowerUpUI() {
    const bar = document.getElementById('powerupBar');
    if (!bar) return;
    bar.innerHTML = '';
    for (let type in state.activePowerUps) {
        const p = POWERUP_TYPES[type];
        const tag = document.createElement('div');
        tag.className = 'powerup-tag';
        tag.style.borderColor = p.color;
        tag.style.color = p.color;
        tag.textContent = p.duration === -1 ? p.label : `${p.label} ${Math.ceil(state.activePowerUps[type])}s`;
        bar.appendChild(tag);
    }
    if (state.activeWeapon) {
        const w = WEAPON_TYPES[state.activeWeapon];
        const tag = document.createElement('div');
        tag.className = 'powerup-tag';
        tag.style.borderColor = w.color;
        tag.style.color = w.color;
        tag.textContent = `${w.label} ${Math.ceil(state.weaponTimer)}s`;
        bar.appendChild(tag);
    }
}

export function updatePassiveHUD() {
    const hud = document.getElementById('passiveHud');
    if (!hud || state.gameState !== 'playing') {
        if (hud) hud.innerHTML = '';
        return;
    }
    hud.innerHTML = '';
    const ship = SHIP_CLASSES[state.selectedShipKey];
    if (!ship.passive) return;

    if (state.selectedShipKey === 'INTERCEPTOR') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (state.aceActive) {
            tag.style.borderColor = '#ff0';
            tag.style.color = '#ff0';
            tag.textContent = `🔥 ACE TIME! ${Math.ceil(state.aceTimer)}s`;
        } else {
            tag.style.borderColor = ship.color;
            tag.style.color = ship.color;
            tag.textContent = `${ship.passive.icon} ${state.aceStreak}/10`;
        }
        hud.appendChild(tag);
    }

    if (state.selectedShipKey === 'TITAN') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        tag.style.borderColor = '#f80';
        tag.style.color = '#f80';
        tag.textContent = `💥 ${state.salvoCounter}/6`;
        hud.appendChild(tag);
    }

    if (state.selectedShipKey === 'VANGUARD') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (state.player.shield) {
            tag.style.borderColor = '#08f';
            tag.style.color = '#08f';
            tag.textContent = '🛡️ ACTIVE';
        } else {
            const remaining = Math.max(0, 6 - state.lastDamageTime);
            tag.style.borderColor = remaining <= 2 ? '#0f0' : '#888';
            tag.style.color = remaining <= 2 ? '#0f0' : '#888';
            tag.textContent = `♻️ ${remaining.toFixed(1)}s`;
        }
        hud.appendChild(tag);
    }

    if (state.selectedShipKey === 'SPECTRE') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (state.phaseShiftCooldown > 0) {
            tag.style.borderColor = '#888';
            tag.style.color = '#888';
            tag.textContent = `💨 ${Math.ceil(state.phaseShiftCooldown)}s`;
        } else {
            tag.style.borderColor = '#ff0';
            tag.style.color = '#ff0';
            tag.textContent = '💨 READY';
        }
        hud.appendChild(tag);
    }

    if (state.selectedShipKey === 'HARBINGER') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        tag.style.borderColor = '#a0f';
        tag.style.color = '#a0f';
        tag.textContent = `🌌 ${4 - (state.harbingerShotCounter % 4)}`;
        hud.appendChild(tag);
    }
}

// ===== WEAPON CRATES =====
export function spawnWeapon(x, y) {
    const types = Object.keys(WEAPON_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    state.weapons.push({
        x: x - 10, y: y,
        width: 20, height: 20,
        type: type,
        speed: 60,
        ...WEAPON_TYPES[type]
    });
}

export function updateWeapons(dt) {
    for (let i = state.weapons.length - 1; i >= 0; i--) {
        state.weapons[i].y += state.weapons[i].speed * dt;
        if (state.weapons[i].y > canvas.height) {
            state.weapons.splice(i, 1);
        }
    }
}

export function drawWeapons() {
    state.weapons.forEach(w => {
        ctx.fillStyle = w.color;
        ctx.shadowColor = w.glow;
        ctx.shadowBlur = 12;
        ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(w.symbol, w.x + w.width / 2, w.y + w.height / 2 + 1);
    });
}

export function applyWeapon(type) {
    state.activeWeapon = type;
    state.weaponTimer = WEAPON_TYPES[type].duration;
    audio.playPowerUp();
    spawnFloatingText(state.player.x + state.player.width / 2, state.player.y - 20, WEAPON_TYPES[type].label, WEAPON_TYPES[type].color);
    updatePowerUpUI();
}

export function updateWeaponTimer(dt) {
    if (state.activeWeapon) {
        state.weaponTimer -= dt;
        if (state.weaponTimer <= 0) {
            state.activeWeapon = null;
            updatePowerUpUI();
        }
    }
}

// ===== WINGMAN SYSTEM =====
export function createWingmen() {
    state.wingmen = [
        { x: 0, y: 0, width: 28, height: 18, color: '#0f0', side: 'left', cooldown: 0, maxCooldown: 0.35 },
        { x: 0, y: 0, width: 28, height: 18, color: '#0f0', side: 'right', cooldown: 0, maxCooldown: 0.35 }
    ];
}

export function updateWingmen(dt) {
    if (!state.activePowerUps.WINGMAN) { state.wingmen = []; return; }
    if (state.wingmen.length === 0) createWingmen();
    
    state.wingmen.forEach(w => {
        if (w.side === 'left') {
            w.x = state.player.x - w.width - 10;
        } else {
            w.x = state.player.x + state.player.width + 10;
        }
        w.y = state.player.y + (state.player.height - w.height) / 2;
        
        w.cooldown -= dt;
        if (w.cooldown <= 0) {
            state.bullets.push({
                x: w.x + w.width / 2,
                y: w.y,
                width: 3,
                height: 10,
                speed: 450,
                color: '#0f0',
                dx: 0,
                trail: []
            });
            audio.playShoot();
            w.cooldown = w.maxCooldown;
        }
    });
}

export function drawWingmen() {
    state.wingmen.forEach(w => {
        ctx.fillStyle = w.color;
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(w.x + w.width / 2, w.y);
        ctx.lineTo(w.x + w.width, w.y + w.height);
        ctx.lineTo(w.x, w.y + w.height);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = themeColor('bullet');
        ctx.fillRect(w.x + w.width / 2 - 2, w.y + w.height, 4, 4);
        ctx.shadowBlur = 0;
    });
}

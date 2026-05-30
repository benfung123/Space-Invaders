import { GAME_WIDTH, GAME_HEIGHT, STAR_LAYERS, THEMES } from './config.js';
import { state } from './state.js';
import { storage } from './storage.js';
import { canvas } from './dom.js';

export const ctx = canvas.getContext('2d');
export { canvas };

// ===== SPRITES =====
export const SPRITES = {
    ship_interceptor: new Image(), ship_vanguard: new Image(),
    ship_spectre: new Image(), ship_titan: new Image(),
    ship_harbinger: new Image(),
    alien_normal: new Image(), alien_fast: new Image(), alien_tank: new Image(),
    boss_destroyer: new Image(), boss_carrier: new Image(), boss_artillery: new Image(),
    minion: new Image(), ufo: new Image()
};

export function loadSprites() {
    for (const key in SPRITES) {
        SPRITES[key].src = 'assets/sprites/' + key + '.png';
    }
}
loadSprites();

export function drawSprite(img, x, y, w, h) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const sx = x + (w - img.width) / 2;
    const sy = y + (h - img.height) / 2;
    ctx.drawImage(img, sx, sy);
}

export function getShipSprite() {
    return SPRITES['ship_' + state.selectedShipKey.toLowerCase()] || SPRITES.ship_interceptor;
}

export function getAlienSprite(type) {
    return SPRITES['alien_' + type.toLowerCase()] || SPRITES.alien_normal;
}

export function getBossSprite(type) {
    return SPRITES['boss_' + type.toLowerCase()] || SPRITES.boss_destroyer;
}

// ===== SCREEN SHAKE =====
export function triggerShake(intensity) {
    state.screenShake = intensity;
}

export function applyShake() {
    if (state.screenShake > 0.3) {
        const dx = (Math.random() - 0.5) * 2 * state.screenShake;
        const dy = (Math.random() - 0.5) * 2 * state.screenShake;
        ctx.save();
        ctx.translate(dx, dy);
    }
}

export function decayShake() {
    if (state.screenShake > 0.3) {
        state.screenShake *= 0.88;
        ctx.restore();
    } else {
        state.screenShake = 0;
    }
}

// ===== RESIZE =====
export function resizeCanvas() {
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    const margin = 16;
    const reservedHeight = window.innerWidth <= 768 ? 210 : 110;

    const maxDisplayW = window.innerWidth - margin * 2;
    const maxDisplayH = window.innerHeight - reservedHeight;

    let displayW = maxDisplayW;
    let displayH = displayW / aspect;

    if (displayH > maxDisplayH) {
        displayH = maxDisplayH;
        displayW = displayH * aspect;
    }

    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    canvas.style.width = Math.floor(displayW) + 'px';
    canvas.style.height = Math.floor(displayH) + 'px';
}

// ===== THEME =====
export function themeColor(key) {
    return THEMES[state.currentTheme][key];
}

export function applyTheme(themeKey) {
    state.currentTheme = themeKey;
    storage.set('si_theme', themeKey);
    const t = THEMES[themeKey];
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', t.ui);
    root.style.setProperty('--theme-bullet', t.bullet);
    root.style.setProperty('--theme-bomb', t.bomb);
    root.style.setProperty('--theme-bunker', t.bunker);
}

// ===== STARS =====
export function initStars() {
    state.stars.length = 0;
    STAR_LAYERS.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
            state.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * (layer.sizeMax - layer.sizeMin) + layer.sizeMin,
                speed: layer.speed,
                opacity: layer.opacity
            });
        }
    });
}

export function updateStars() {
    state.stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });
}

export function drawStars() {
    state.stars.forEach(star => {
        ctx.globalAlpha = star.opacity;
        ctx.fillStyle = themeColor('star');
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

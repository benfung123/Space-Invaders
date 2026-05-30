// ===== GAME DIMENSIONS =====
export const GAME_WIDTH = 600;
export const GAME_HEIGHT = 800;

export const COMBO_MAX = 5;

// ===== BUNKER =====
export const BUNKER_BRICK_W = 8;
export const BUNKER_BRICK_H = 6;
export const BUNKER_GAP = 2;

// ===== STARFIELD =====
const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Capacitor/i.test(navigator.userAgent);
export const STAR_LAYERS = [
    { count: isMobile ? 30 : 60, speed: 0.4, sizeMin: 0.3, sizeMax: 1.0, opacity: 0.25 },
    { count: isMobile ? 18 : 35, speed: 1.0, sizeMin: 0.8, sizeMax: 1.8, opacity: 0.55 },
    { count: isMobile ? 8  : 15, speed: 2.2, sizeMin: 1.5, sizeMax: 3.0, opacity: 0.9  }
];

// ===== SHIP CLASSES =====
export const SHIP_CLASSES = {
    INTERCEPTOR: {
        key: 'INTERCEPTOR', name: 'Interceptor', icon: '✈️',
        desc: 'Balanced fighter. Reliable in all situations.',
        lives: 3, speedMult: 1.0, fireRateMult: 1.0,
        startPowerUp: null, bunkerBonus: 0,
        color: '#0f0', glow: '#0f0',
        unlockScore: 0,
        passive: { name: 'ACE BONUS', icon: '🎯', desc: 'Every 10-kill streak triggers 2s Ace Time: bullets pierce + score ×2' }
    },
    VANGUARD: {
        key: 'VANGUARD', name: 'Vanguard', icon: '🛡️',
        desc: 'Heavy armor. Starts with Shield, slower movement.',
        lives: 4, speedMult: 0.9, fireRateMult: 1.0,
        startPowerUp: 'SHIELD', bunkerBonus: 0,
        color: '#08f', glow: '#08f',
        unlockScore: 2000,
        passive: { name: 'REGENERATIVE PLATING', icon: '♻️', desc: 'After 6s without damage, shield auto-recharges' }
    },
    SPECTRE: {
        key: 'SPECTRE', name: 'Spectre', icon: '👻',
        desc: 'Glass cannon. Starts with Multi-Shot, high speed.',
        lives: 2, speedMult: 1.15, fireRateMult: 1.0,
        startPowerUp: 'MULTI_SHOT', bunkerBonus: 0,
        color: '#ff0', glow: '#ff0',
        unlockScore: 6000,
        passive: { name: 'PHASE SHIFT', icon: '💨', desc: 'Double-tap direction to blink 60px with 0.3s invincibility (5s cooldown)' }
    },
    TITAN: {
        key: 'TITAN', name: 'Titan', icon: '🏰',
        desc: 'Fortress. Extra life, built-in bunker row, slow fire.',
        lives: 5, speedMult: 0.85, fireRateMult: 0.8,
        startPowerUp: null, bunkerBonus: 1,
        color: '#f80', glow: '#f80',
        unlockScore: 12000,
        passive: { name: 'SALVO', icon: '💥', desc: 'Every 6th shot fires an artillery shell that explodes in a 35px radius' }
    },
    HARBINGER: {
        key: 'HARBINGER', name: 'Harbinger', icon: '🌌',
        desc: 'Gravity wielder. Singularity orbs pull aliens. Unlocked in Loop 2+.',
        lives: 2, speedMult: 0.9, fireRateMult: 0.9,
        startPowerUp: null, bunkerBonus: 0,
        color: '#a0f', glow: '#a0f',
        unlockScore: 999999,
        passive: { name: 'EVENT HORIZON', icon: '🌀', desc: 'Singularity orbs deal 1 DPS and pull bombs + dive bombers' }
    }
};

// ===== ALIEN TYPES =====
export const ALIEN_TYPES = {
    NORMAL: { hp: 1, pointsMult: 1.0, zigzag: false },
    TANK:   { hp: 3, pointsMult: 1.5, zigzag: false },
    FAST:   { hp: 1, pointsMult: 1.0, zigzag: true }
};

export const ELITE_TYPES = {
    SHIELDED:  { color: '#08f', label: '🛡️', pointsMult: 1.3 },
    SPLITTER:  { color: '#f80', label: '✦', pointsMult: 1.0 },
    SPEEDSTER: { color: '#ff0', label: '⚡', pointsMult: 1.2 },
    CARRIER:   { color: '#f0f', label: '🎁', pointsMult: 1.4 }
};

export function getAlienDistribution(level) {
    if (level === 1) return { NORMAL: 1.0, TANK: 0, FAST: 0 };
    if (level === 2) return { NORMAL: 0.8, TANK: 0, FAST: 0.2 };
    if (level === 3) return { NORMAL: 0.7, TANK: 0.1, FAST: 0.2 };
    return { NORMAL: 0.5, TANK: 0.2, FAST: 0.3 };
}

export function pickAlienType(level) {
    const dist = getAlienDistribution(level);
    const roll = Math.random();
    if (roll < dist.NORMAL) return 'NORMAL';
    if (roll < dist.NORMAL + dist.TANK) return 'TANK';
    return 'FAST';
}

// ===== POWER-UP SYSTEM =====
export const POWERUP_TYPES = {
    RAPID_FIRE: { color: '#f0f', glow: '#f0f', label: '⚡ RAPID', duration: 10 },
    SHIELD:     { color: '#08f', glow: '#08f', label: '🛡️ SHIELD', duration: -1 },
    MULTI_SHOT: { color: '#ff0', glow: '#ff0', label: '🔱 MULTI', duration: 10 },
    WINGMAN: { color: '#0f0', glow: '#0f0', label: '✈️ WING', duration: 10 }
};

export const WEAPON_TYPES = {
    SPREAD:  { color: '#ff8c00', glow: '#ff8c00', label: '🔥 SPREAD', duration: 10, symbol: 'F' },
    PIERCE:  { color: '#e0f7fa', glow: '#fff',    label: '⚡ PIERCE', duration: 10, symbol: 'P' },
    HOMING:  { color: '#ff69b4', glow: '#ff69b4', label: '🎯 HOMING', duration: 10, symbol: 'H' },
    NUKE:    { color: '#ff4500', glow: '#ff0',    label: '💥 NUKE',   duration: 10, symbol: 'N' }
};

// ===== THEMES =====
export const THEMES = {
    CLASSIC:   { name: 'Classic',   player: '#0f0', bullet: '#0ff', bomb: '#f00', bunker: '#0a0', bunkerGlow: '#0f0', minion: '#0f0', ui: '#0f0', star: '#fff', alienRows: ['#f00','#f80','#ff0','#0f0','#0ff'] },
    CYBERPUNK: { name: 'Cyberpunk', player: '#f0f', bullet: '#ff0', bomb: '#f0f', bunker: '#408', bunkerGlow: '#f0f', minion: '#f0f', ui: '#f0f', star: '#f0f', alienRows: ['#f0f','#f0f','#ff0','#0ff','#0ff'] },
    MATRIX:    { name: 'Matrix',    player: '#0f0', bullet: '#0f0', bomb: '#0a0', bunker: '#050', bunkerGlow: '#0f0', minion: '#0f0', ui: '#0a0', star: '#0f0', alienRows: ['#0a0','#0a0','#0f0','#0f0','#0f0'] },
    SUNSET:    { name: 'Sunset',    player: '#f80', bullet: '#ff0', bomb: '#f00', bunker: '#804', bunkerGlow: '#f80', minion: '#f80', ui: '#f80', star: '#ff0', alienRows: ['#f00','#f80','#ff0','#f80','#80f'] },
    ICE:       { name: 'Ice',       player: '#0ff', bullet: '#fff', bomb: '#08f', bunker: '#048', bunkerGlow: '#0ff', minion: '#0ff', ui: '#0ff', star: '#8ff', alienRows: ['#048','#08f','#0ff','#8ff','#fff'] }
};

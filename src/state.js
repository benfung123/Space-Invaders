import { storage } from './storage.js';
import { SHIP_CLASSES } from './config.js';

// ===== PERSISTED STATE =====
const _highScore = parseInt(storage.get('si_highScore')) || 0;
let _shipUnlocks = storage.getJson('si_shipUnlocks') || ['INTERCEPTOR'];
if (!Array.isArray(_shipUnlocks)) _shipUnlocks = ['INTERCEPTOR'];
const _harbingerUnlocked = storage.get('si_harbingerUnlocked') === 'true';
if (_harbingerUnlocked && !_shipUnlocks.includes('HARBINGER')) {
    _shipUnlocks.push('HARBINGER');
}

// ===== CENTRAL GAME STATE =====
export const state = {
    // Persisted
    highScore: _highScore,
    selectedShipKey: 'INTERCEPTOR',
    shipUnlocks: _shipUnlocks,
    shipBestScores: storage.getJson('si_shipScores') || {},
    loopCount: 0,
    highestLoopReached: parseInt(storage.get('si_highestLoop')) || 0,
    loopUnlocked: storage.get('si_loopUnlocked') === 'true',
    harbingerUnlocked: _harbingerUnlocked,
    currentTheme: THEMES[storage.get('si_theme')] ? storage.get('si_theme') : 'CLASSIC',
    leaderboard: Array.isArray(storage.getJson('si_leaderboard')) ? storage.getJson('si_leaderboard') : [],

    // Game
    gameState: 'menu',
    score: 0,
    lives: 3,
    level: 1,
    levelTransitioning: false,
    wavePerfect: true,
    animationId: null,

    // Hazard / event
    activeEvent: null,
    eventTriggeredThisLevel: false,
    empActive: false,
    empTimer: 0,
    meteors: [],
    singularities: [],
    harbingerShotCounter: 0,
    lastTime: 0,

    // Ship passives
    aceStreak: 0,
    aceActive: false,
    aceTimer: 0,
    salvoCounter: 0,
    lastDamageTime: 0,
    phaseShiftCooldown: 0,
    phaseShiftTimer: 0,
    lastKeyTapTime: { left: 0, right: 0 },

    // Economy
    credits: 0,

    // Effects
    screenShake: 0,

    // Combo
    comboCount: 0,
    comboTimer: 0,

    // Input
    keys: {},
    touchInput: { left: false, right: false, fire: false },

    // Stars
    stars: [],

    // Weapons / power-ups
    activeWeapon: null,
    weaponTimer: 0,
    weapons: [],
    powerUps: [],
    activePowerUps: {},
    wingmen: [],

    // UFO
    ufo: null,
    ufoTimer: 0,
    ufoNextSpawn: 10 + Math.random() * 8,

    // Boss
    boss: null,
    bossDefeated: false,
    minions: [],

    // Aliens
    aliens: [],
    alienDirection: 1,
    alienSpeed: 30,
    alienDropDistance: 14,
    alienMoveTimer: 0,
    alienShootTimer: 0,
    levelConfig: null,
    diveBomberTimer: 0,
    diveBomberCooldown: 7 + Math.random() * 4,

    // Projectiles / particles
    bullets: [],
    bombs: [],
    particles: [],
    floatingTexts: [],

    // Upgrades
    upgrades: {
        speedBonus: 0,
        bunkerBonus: 0,
        comboBonus: 0,
        fireRateBonus: 0
    },

    // NG+ carry
    carriedUpgrades: null
};

// ===== HELPERS =====
export function saveShipProgress() {
    storage.setJson('si_shipUnlocks', state.shipUnlocks);
    storage.setJson('si_shipScores', state.shipBestScores);
}

export function getUnlockedShips() {
    const best = Math.max(state.highScore, state.score);
    let changed = false;
    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        if (!state.shipUnlocks.includes(key) && best >= ship.unlockScore) {
            state.shipUnlocks.push(key);
            changed = true;
        }
    }
    if (changed) saveShipProgress();
    return state.shipUnlocks;
}

export function checkNewUnlocks(lastBest) {
    const newUnlocks = [];
    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        if (!state.shipUnlocks.includes(key) && state.score >= ship.unlockScore && lastBest < ship.unlockScore) {
            state.shipUnlocks.push(key);
            newUnlocks.push(ship);
        }
    }
    if (newUnlocks.length) saveShipProgress();
    return newUnlocks;
}

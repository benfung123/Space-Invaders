const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ===== SHIP CLASSES =====
const SHIP_CLASSES = {
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

let selectedShipKey = 'INTERCEPTOR';
let shipUnlocks = JSON.parse(localStorage.getItem('si_shipUnlocks')) || ['INTERCEPTOR'];
let shipBestScores = JSON.parse(localStorage.getItem('si_shipScores')) || {};

// Loop / New Game+ state
let loopCount = 0;
let highestLoopReached = parseInt(localStorage.getItem('si_highestLoop')) || 0;
let loopUnlocked = localStorage.getItem('si_loopUnlocked') === 'true';
let harbingerUnlocked = localStorage.getItem('si_harbingerUnlocked') === 'true';
let carriedUpgrades = null;

// Sync Harbinger unlock on load
if (harbingerUnlocked && !shipUnlocks.includes('HARBINGER')) {
    shipUnlocks.push('HARBINGER');
}

function saveShipProgress() {
    localStorage.setItem('si_shipUnlocks', JSON.stringify(shipUnlocks));
    localStorage.setItem('si_shipScores', JSON.stringify(shipBestScores));
}

function getUnlockedShips() {
    const best = Math.max(highScore, score);
    let changed = false;
    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        if (!shipUnlocks.includes(key) && best >= ship.unlockScore) {
            shipUnlocks.push(key);
            changed = true;
        }
    }
    if (changed) saveShipProgress();
    return shipUnlocks;
}

function checkNewUnlocks(lastBest) {
    const newUnlocks = [];
    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        if (!shipUnlocks.includes(key) && score >= ship.unlockScore && lastBest < ship.unlockScore) {
            shipUnlocks.push(key);
            newUnlocks.push(ship);
        }
    }
    if (newUnlocks.length) saveShipProgress();
    return newUnlocks;
}

// ===== AUDIO SYSTEM =====
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.bgmInterval = null;
        this.noteIndex = 0;
        this.notes = [110, 110, 130, 110, 98, 98, 110, 98];
        this.masterVolume = 0.1;
        this.muted = false;

        // MP3 BGM tracks
        this.bgmNormal = new Audio('Gravity_Well.mp3');
        this.bgmBoss = new Audio('Hull_Breach_Protocol.mp3');
        this.bgmShop = new Audio('Gravity_Well_Escape.mp3');
        this.bgmNormal.loop = true;
        this.bgmBoss.loop = true;
        this.bgmShop.loop = true;
        this.bgmNormal.volume = 0.35;
        this.bgmBoss.volume = 0.35;
        this.bgmShop.volume = 0.35;
        this.bgmNormal.preload = 'auto';
        this.bgmBoss.preload = 'auto';
        this.bgmShop.preload = 'auto';
        this.currentTrack = null;
    }

    toggleMute() {
        this.muted = !this.muted;
        this.bgmNormal.muted = this.muted;
        this.bgmBoss.muted = this.muted;
        this.bgmShop.muted = this.muted;
        if (this.muted) {
            this.stopBGM();
        } else if (gameState === 'playing' || gameState === 'shop') {
            this.startBGM();
        }
        return this.muted;
    }

    init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
        // Unlock HTML5 Audio for mobile (iOS Safari / Chrome Android)
        [this.bgmNormal, this.bgmBoss, this.bgmShop].forEach(track => {
            track.play().then(() => track.pause()).catch(() => {});
        });
    }

    _osc(type, freq, duration, vol, freqEnd = null) {
        if (!this.initialized || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (freqEnd !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playShoot() { this._osc('square', 880, 0.1, this.masterVolume, 440); }
    playExplosion() { this._osc('sawtooth', 200, 0.25, this.masterVolume * 1.2, 40); }
    playUfo() { this._osc('sine', 500, 0.6, this.masterVolume * 0.6, 700); }
    playHitShield() { this._osc('square', 350, 0.3, this.masterVolume, 80); }

    playPowerUp() {
        if (!this.initialized) return;
        [523, 659, 784].forEach((freq, i) => {
            setTimeout(() => this._osc('square', freq, 0.15, this.masterVolume, freq * 0.5), i * 70);
        });
    }

    playBonus() {
        if (!this.initialized) return;
        [784, 880, 1047, 1319].forEach((freq, i) => {
            setTimeout(() => this._osc('square', freq, 0.12, this.masterVolume, freq * 0.5), i * 60);
        });
    }

    playLevelUp() {
        if (!this.initialized || this.muted) return;
        // Ascending fanfare: "LEVEL UP!"
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._osc('square', freq, 0.18, this.masterVolume, freq * 0.5);
                this._osc('triangle', freq * 2, 0.15, this.masterVolume * 0.5, freq * 2);
            }, i * 90);
        });
    }

    startShopBGM() {
        if (this.muted) return;
        this.stopBGM();
        const track = this.bgmShop;
        track.currentTime = 0;
        const playPromise = track.play();
        if (playPromise) playPromise.catch(() => {});
        this.currentTrack = track;
    }

    startBGM() {
        if (this.muted) return;
        this.stopBGM();
        const track = boss ? this.bgmBoss : this.bgmNormal;
        track.currentTime = 0;
        const playPromise = track.play();
        if (playPromise) playPromise.catch(() => {});
        this.currentTrack = track;
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
        this.bgmNormal.pause();
        this.bgmBoss.pause();
        this.bgmShop.pause();
        this.currentTrack = null;
    }
}

const audio = new SoundManager();

// ===== GAME STATE =====
let gameState = 'menu';
let score = 0;
let highScore = parseInt(localStorage.getItem('si_highScore')) || 0;
let lives = 3;
let level = 1;
let levelTransitioning = false;
let wavePerfect = true;
let animationId;

// Hazard event system
let activeEvent = null; // { type, timer, data }
let eventTriggeredThisLevel = false;
let empActive = false;
let empTimer = 0;
let meteors = [];
let singularities = [];
let harbingerShotCounter = 0;
let lastTime = 0;

// Ship passive state
let aceStreak = 0;
let aceActive = false;
let aceTimer = 0;
let salvoCounter = 0;
let lastDamageTime = 0;
let phaseShiftCooldown = 0;
let phaseShiftTimer = 0;
let lastKeyTapTime = { left: 0, right: 0 };

// ===== ECONOMY =====
let credits = 0;

// ===== SCREEN SHAKE =====
let screenShake = 0;

function triggerShake(intensity) {
    screenShake = intensity;
}

function applyShake() {
    if (screenShake > 0.3) {
        const dx = (Math.random() - 0.5) * 2 * screenShake;
        const dy = (Math.random() - 0.5) * 2 * screenShake;
        ctx.save();
        ctx.translate(dx, dy);
    }
}

function decayShake() {
    if (screenShake > 0.3) {
        screenShake *= 0.88;
        ctx.restore();
    } else {
        screenShake = 0;
    }
}

// ===== ALIEN TYPES =====
const ALIEN_TYPES = {
    NORMAL: { hp: 1, pointsMult: 1.0, zigzag: false },
    TANK:   { hp: 3, pointsMult: 1.5, zigzag: false },
    FAST:   { hp: 1, pointsMult: 1.0, zigzag: true }
};

const ELITE_TYPES = {
    SHIELDED:  { color: '#08f', label: '🛡️', pointsMult: 1.3 },
    SPLITTER:  { color: '#f80', label: '✦', pointsMult: 1.0 },
    SPEEDSTER: { color: '#ff0', label: '⚡', pointsMult: 1.2 },
    CARRIER:   { color: '#f0f', label: '🎁', pointsMult: 1.4 }
};

function getAlienDistribution(level) {
    if (level === 1) return { NORMAL: 1.0, TANK: 0, FAST: 0 };
    if (level === 2) return { NORMAL: 0.8, TANK: 0, FAST: 0.2 };
    if (level === 3) return { NORMAL: 0.7, TANK: 0.1, FAST: 0.2 };
    return { NORMAL: 0.5, TANK: 0.2, FAST: 0.3 };
}

function pickAlienType(level) {
    const dist = getAlienDistribution(level);
    const roll = Math.random();
    if (roll < dist.NORMAL) return 'NORMAL';
    if (roll < dist.NORMAL + dist.TANK) return 'TANK';
    return 'FAST';
}

// ===== UPGRADE SHOP =====
let upgrades = {
    speedBonus: 0,
    bunkerBonus: 0,
    comboBonus: 0,
    fireRateBonus: 0
};

function scaleCost(base) {
    return Math.floor(base * (1 + (level - 1) * 0.25));
}

function getFireRateCooldown() {
    const b = upgrades.fireRateBonus;
    return 0.25 * Math.pow(0.8, Math.min(b, 3)) * Math.pow(0.9, Math.max(0, b - 3));
}

const SHOP_ITEMS = [
    {
        id: 'extraLife', name: 'Extra Life', desc: '+1 life (max 5)',
        getCost: () => scaleCost([500, 900, 1500, 2200, 3000][lives] || 9999),
        canBuy: () => lives < 5,
        buy: () => { lives++; updateUI(); }
    },
    {
        id: 'speed', name: 'Faster Ship', desc: '+20% move speed (max Lv10)',
        getCost: () => scaleCost([400, 700, 1100, 1600, 2200, 2900, 3700, 4600, 5600, 6800][upgrades.speedBonus] || 9999),
        canBuy: () => upgrades.speedBonus < 10,
        buy: () => { upgrades.speedBonus++; player.speed = 300 * (1 + upgrades.speedBonus * 0.2); }
    },
    {
        id: 'bunker', name: 'Wider Bunkers', desc: '+1 brick row per bunker (max Lv10)',
        getCost: () => scaleCost([350, 600, 950, 1400, 1900, 2500, 3200, 4000, 4900, 5900][upgrades.bunkerBonus] || 9999),
        canBuy: () => upgrades.bunkerBonus < 10,
        buy: () => { upgrades.bunkerBonus++; createBunkers(); }
    },
    {
        id: 'combo', name: 'Longer Combo', desc: '+0.5s combo window (max Lv10)',
        getCost: () => scaleCost([300, 550, 850, 1200, 1600, 2100, 2700, 3400, 4200, 5100][upgrades.comboBonus] || 9999),
        canBuy: () => upgrades.comboBonus < 10,
        buy: () => { upgrades.comboBonus++; }
    },
    {
        id: 'fireRate', name: 'Quick Trigger', desc: 'Permanent fire rate up (max Lv10)',
        getCost: () => scaleCost([400, 750, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800][upgrades.fireRateBonus] || 9999),
        canBuy: () => upgrades.fireRateBonus < 10,
        buy: () => { upgrades.fireRateBonus++; player.baseCooldown = getFireRateCooldown(); }
    }
];

// ===== BUNKERS =====
let bunkers = [];
const BUNKER_BRICK_W = 8;
const BUNKER_BRICK_H = 6;
const BUNKER_GAP = 2;

function createBunkers() {
    bunkers = [];
    const cols = 6;
    const pattern = [
        [1,1,1,1,1,1],
        [1,1,1,1,1,1],
        [1,1,0,0,1,1],
        [1,0,0,0,0,1]
    ];
    // Extra rows grow UPWARD (away from player), keeping bottom fixed
    for (let e = 0; e < upgrades.bunkerBonus; e++) {
        pattern.unshift([1,1,1,1,1,1]);
    }
    const bWidth = cols * (BUNKER_BRICK_W + BUNKER_GAP) - BUNKER_GAP;
    const numBunkers = 4;
    const spacing = canvas.width / (numBunkers + 1);
    const y = canvas.height - 85 - upgrades.bunkerBonus * (BUNKER_BRICK_H + BUNKER_GAP);

    for (let b = 0; b < numBunkers; b++) {
        const bx = spacing * (b + 1) - bWidth / 2;
        for (let r = 0; r < pattern.length; r++) {
            for (let c = 0; c < cols; c++) {
                if (pattern[r][c]) {
                    bunkers.push({
                        x: bx + c * (BUNKER_BRICK_W + BUNKER_GAP),
                        y: y + r * (BUNKER_BRICK_H + BUNKER_GAP),
                        width: BUNKER_BRICK_W,
                        height: BUNKER_BRICK_H,
                        alive: true
                    });
                }
            }
        }
    }
}

function drawBunkers() {
    ctx.fillStyle = '#0a0';
    ctx.shadowColor = '#0f0';
    ctx.shadowBlur = 4;
    bunkers.forEach(b => {
        if (!b.alive) return;
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });
    ctx.shadowBlur = 0;
}

// ===== FLOATING TEXT =====
let floatingTexts = [];

function spawnFloatingText(x, y, text, color = '#fff') {
    floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 0.9,
        maxLife: 0.9,
        vy: -50
    });
}

function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.life -= dt;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

function drawFloatingTexts() {
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

// ===== COMBO SYSTEM =====
let comboCount = 0;
let comboTimer = 0;
function getComboWindow() {
    return 2.2 + upgrades.comboBonus * 0.5;
}
const COMBO_MAX = 5;

function addComboKill() {
    if (comboCount < COMBO_MAX) comboCount++;
    comboTimer = getComboWindow();
    updateUI();
    // Interceptor: Ace Bonus streak
    if (selectedShipKey === 'INTERCEPTOR' && !aceActive) {
        aceStreak++;
        if (aceStreak >= 10) {
            aceActive = true;
            aceTimer = 2;
            spawnFloatingText(player.x + player.width / 2, player.y - 30, '🔥 ACE TIME!', '#ff0');
            audio.playBonus();
        }
    }
}

function updateCombo(dt) {
    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
            comboCount = 0;
            updateUI();
        }
    }
}

// Responsive canvas sizing — fixed logical resolution, CSS scales to fit viewport
const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;

function resizeCanvas() {
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    const margin = 16;
    const reservedHeight = window.innerWidth <= 768 ? 210 : 110; // UI + controls

    const maxDisplayW = window.innerWidth - margin * 2;
    const maxDisplayH = window.innerHeight - reservedHeight;

    let displayW = maxDisplayW;
    let displayH = displayW / aspect;

    if (displayH > maxDisplayH) {
        displayH = maxDisplayH;
        displayW = displayH * aspect;
    }

    // Fixed internal resolution — game logic always uses 600×800
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;

    // CSS display size scales to fit viewport
    canvas.style.width = Math.floor(displayW) + 'px';
    canvas.style.height = Math.floor(displayH) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Input handling
const keys = {};
const touchInput = { left: false, right: false, fire: false };

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault();
        player.shoot();
    }
    // Spectre: Phase Shift double-tap
    if (gameState === 'playing' && selectedShipKey === 'SPECTRE' && phaseShiftCooldown <= 0) {
        const now = performance.now();
        const dir = e.key === 'ArrowLeft' || e.key === 'a' ? 'left' : e.key === 'ArrowRight' || e.key === 'd' ? 'right' : null;
        if (dir) {
            if (lastKeyTapTime[dir] && now - lastKeyTapTime[dir] < 300) {
                // Double tap!
                const dx = dir === 'left' ? -60 : 60;
                player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + dx));
                phaseShiftCooldown = 5;
                phaseShiftTimer = 0.3;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#ff0', 8);
                audio.playBonus();
                lastKeyTapTime[dir] = 0;
            } else {
                lastKeyTapTime[dir] = now;
                lastKeyTapTime[dir === 'left' ? 'right' : 'left'] = 0;
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Touch controls
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const fireBtn = document.getElementById('fireBtn');

function setupTouchBtn(btn, key) {
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchInput[key] = true;
        // Spectre: Phase Shift double-tap on touch
        if (gameState === 'playing' && selectedShipKey === 'SPECTRE' && phaseShiftCooldown <= 0 && (key === 'left' || key === 'right')) {
            const now = performance.now();
            if (lastKeyTapTime[key] && now - lastKeyTapTime[key] < 300) {
                const dx = key === 'left' ? -60 : 60;
                player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + dx));
                phaseShiftCooldown = 5;
                phaseShiftTimer = 0.3;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#ff0', 8);
                audio.playBonus();
                lastKeyTapTime[key] = 0;
            } else {
                lastKeyTapTime[key] = now;
                lastKeyTapTime[key === 'left' ? 'right' : 'left'] = 0;
            }
        }
    }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); touchInput[key] = false; });
    btn.addEventListener('touchcancel', (e) => { touchInput[key] = false; });
    btn.addEventListener('mousedown', (e) => { touchInput[key] = true; });
    btn.addEventListener('mouseup', (e) => { touchInput[key] = false; });
    btn.addEventListener('mouseleave', (e) => { touchInput[key] = false; });
}

setupTouchBtn(leftBtn, 'left');
setupTouchBtn(rightBtn, 'right');
setupTouchBtn(fireBtn, 'fire');

// ===== PARALLAX STARFIELD =====
const STAR_LAYERS = [
    { count: 60, speed: 0.4, sizeMin: 0.3, sizeMax: 1.0, opacity: 0.25 },
    { count: 35, speed: 1.0, sizeMin: 0.8, sizeMax: 1.8, opacity: 0.55 },
    { count: 15, speed: 2.2, sizeMin: 1.5, sizeMax: 3.0, opacity: 0.9  }
];
let stars = [];

function initStars() {
    stars = [];
    STAR_LAYERS.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * (layer.sizeMax - layer.sizeMin) + layer.sizeMin,
                speed: layer.speed,
                opacity: layer.opacity
            });
        }
    });
}
initStars();

function updateStars() {
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });
}

function drawStars() {
    stars.forEach(star => {
        ctx.globalAlpha = star.opacity;
        ctx.fillStyle = themeColor('star');
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// ===== POWER-UP SYSTEM =====
const POWERUP_TYPES = {
    RAPID_FIRE: { color: '#f0f', glow: '#f0f', label: '⚡ RAPID', duration: 10 },
    SHIELD:     { color: '#08f', glow: '#08f', label: '🛡️ SHIELD', duration: -1 },
    MULTI_SHOT: { color: '#ff0', glow: '#ff0', label: '🔱 MULTI', duration: 10 },
    WINGMAN: { color: '#0f0', glow: '#0f0', label: '✈️ WING', duration: 10 }
};

const WEAPON_TYPES = {
    SPREAD:  { color: '#ff8c00', glow: '#ff8c00', label: '🔥 SPREAD', duration: 10, symbol: 'F' },
    PIERCE:  { color: '#e0f7fa', glow: '#fff',    label: '⚡ PIERCE', duration: 10, symbol: 'P' },
    HOMING:  { color: '#ff69b4', glow: '#ff69b4', label: '🎯 HOMING', duration: 10, symbol: 'H' },
    NUKE:    { color: '#ff4500', glow: '#ff0',    label: '💥 NUKE',   duration: 10, symbol: 'N' }
};

const THEMES = {
    CLASSIC:   { name: 'Classic',   player: '#0f0', bullet: '#0ff', bomb: '#f00', bunker: '#0a0', bunkerGlow: '#0f0', minion: '#0f0', ui: '#0f0', star: '#fff', alienRows: ['#f00','#f80','#ff0','#0f0','#0ff'] },
    CYBERPUNK: { name: 'Cyberpunk', player: '#f0f', bullet: '#ff0', bomb: '#f0f', bunker: '#408', bunkerGlow: '#f0f', minion: '#f0f', ui: '#f0f', star: '#f0f', alienRows: ['#f0f','#f0f','#ff0','#0ff','#0ff'] },
    MATRIX:    { name: 'Matrix',    player: '#0f0', bullet: '#0f0', bomb: '#0a0', bunker: '#050', bunkerGlow: '#0f0', minion: '#0f0', ui: '#0a0', star: '#0f0', alienRows: ['#0a0','#0a0','#0f0','#0f0','#0f0'] },
    SUNSET:    { name: 'Sunset',    player: '#f80', bullet: '#ff0', bomb: '#f00', bunker: '#804', bunkerGlow: '#f80', minion: '#f80', ui: '#f80', star: '#ff0', alienRows: ['#f00','#f80','#ff0','#f80','#80f'] },
    ICE:       { name: 'Ice',       player: '#0ff', bullet: '#fff', bomb: '#08f', bunker: '#048', bunkerGlow: '#0ff', minion: '#0ff', ui: '#0ff', star: '#8ff', alienRows: ['#048','#08f','#0ff','#8ff','#fff'] }
};

let currentTheme = localStorage.getItem('si_theme') || 'CLASSIC';

function themeColor(key) {
    return THEMES[currentTheme][key];
}

function applyTheme(themeKey) {
    currentTheme = themeKey;
    localStorage.setItem('si_theme', themeKey);
    const t = THEMES[themeKey];
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', t.ui);
    root.style.setProperty('--theme-bullet', t.bullet);
    root.style.setProperty('--theme-bomb', t.bomb);
    root.style.setProperty('--theme-bunker', t.bunker);
}

let activeWeapon = null;
let weaponTimer = 0;
let weapons = [];

let powerUps = [];
let activePowerUps = {};
let wingmen = [];

function spawnPowerUp(x, y) {
    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    powerUps.push({
        x: x - 10, y: y,
        width: 20, height: 20,
        type: type,
        speed: 60,
        ...POWERUP_TYPES[type]
    });
}

function updatePowerUps(dt) {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        powerUps[i].y += powerUps[i].speed * dt;
        if (powerUps[i].y > canvas.height) {
            powerUps.splice(i, 1);
        }
    }
    for (let type in activePowerUps) {
        if (activePowerUps[type] > 0) {
            activePowerUps[type] -= dt;
            if (activePowerUps[type] <= 0) {
                delete activePowerUps[type];
                if (type === 'WINGMAN') wingmen = [];
            }
        }
    }
}

function drawPowerUps() {
    powerUps.forEach(p => {
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

function applyPowerUp(type) {
    activePowerUps[type] = POWERUP_TYPES[type].duration;
    if (type === 'WINGMAN') createWingmen();
    audio.playPowerUp();
    updatePowerUpUI();
}

function updatePowerUpUI() {
    const bar = document.getElementById('powerupBar');
    bar.innerHTML = '';
    for (let type in activePowerUps) {
        const p = POWERUP_TYPES[type];
        const tag = document.createElement('div');
        tag.className = 'powerup-tag';
        tag.style.borderColor = p.color;
        tag.style.color = p.color;
        tag.textContent = p.duration === -1 ? p.label : `${p.label} ${Math.ceil(activePowerUps[type])}s`;
        bar.appendChild(tag);
    }
    if (activeWeapon) {
        const w = WEAPON_TYPES[activeWeapon];
        const tag = document.createElement('div');
        tag.className = 'powerup-tag';
        tag.style.borderColor = w.color;
        tag.style.color = w.color;
        tag.textContent = `${w.label} ${Math.ceil(weaponTimer)}s`;
        bar.appendChild(tag);
    }
}

function updatePassiveHUD() {
    const hud = document.getElementById('passiveHud');
    if (!hud || gameState !== 'playing') {
        if (hud) hud.innerHTML = '';
        return;
    }
    hud.innerHTML = '';
    const ship = SHIP_CLASSES[selectedShipKey];
    if (!ship.passive) return;

    // Interceptor: Ace streak counter
    if (selectedShipKey === 'INTERCEPTOR') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (aceActive) {
            tag.style.borderColor = '#ff0';
            tag.style.color = '#ff0';
            tag.textContent = `🔥 ACE TIME! ${Math.ceil(aceTimer)}s`;
        } else {
            tag.style.borderColor = ship.color;
            tag.style.color = ship.color;
            tag.textContent = `${ship.passive.icon} ${aceStreak}/10`;
        }
        hud.appendChild(tag);
    }

    // Titan: Salvo counter
    if (selectedShipKey === 'TITAN') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        tag.style.borderColor = '#f80';
        tag.style.color = '#f80';
        tag.textContent = `💥 ${salvoCounter}/6`;
        hud.appendChild(tag);
    }

    // Vanguard: Regen timer
    if (selectedShipKey === 'VANGUARD') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (player.shield) {
            tag.style.borderColor = '#08f';
            tag.style.color = '#08f';
            tag.textContent = '🛡️ ACTIVE';
        } else {
            const remaining = Math.max(0, 6 - lastDamageTime);
            tag.style.borderColor = remaining <= 2 ? '#0f0' : '#888';
            tag.style.color = remaining <= 2 ? '#0f0' : '#888';
            tag.textContent = `♻️ ${remaining.toFixed(1)}s`;
        }
        hud.appendChild(tag);
    }

    // Spectre: Phase Shift cooldown
    if (selectedShipKey === 'SPECTRE') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        if (phaseShiftCooldown > 0) {
            tag.style.borderColor = '#888';
            tag.style.color = '#888';
            tag.textContent = `💨 ${Math.ceil(phaseShiftCooldown)}s`;
        } else {
            tag.style.borderColor = '#ff0';
            tag.style.color = '#ff0';
            tag.textContent = '💨 READY';
        }
        hud.appendChild(tag);
    }

    // Harbinger: Singularity indicator
    if (selectedShipKey === 'HARBINGER') {
        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        tag.style.borderColor = '#a0f';
        tag.style.color = '#a0f';
        tag.textContent = `🌌 ${4 - (harbingerShotCounter % 4)}`;
        hud.appendChild(tag);
    }
}

// ===== WEAPON CRATES =====
function spawnWeapon(x, y) {
    const types = Object.keys(WEAPON_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    weapons.push({
        x: x - 10, y: y,
        width: 20, height: 20,
        type: type,
        speed: 60,
        ...WEAPON_TYPES[type]
    });
}

function updateWeapons(dt) {
    for (let i = weapons.length - 1; i >= 0; i--) {
        weapons[i].y += weapons[i].speed * dt;
        if (weapons[i].y > canvas.height) {
            weapons.splice(i, 1);
        }
    }
}

function drawWeapons() {
    weapons.forEach(w => {
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

function applyWeapon(type) {
    activeWeapon = type;
    weaponTimer = WEAPON_TYPES[type].duration;
    audio.playPowerUp();
    spawnFloatingText(player.x + player.width / 2, player.y - 20, WEAPON_TYPES[type].label, WEAPON_TYPES[type].color);
    updatePowerUpUI();
}

function updateWeaponTimer(dt) {
    if (activeWeapon) {
        weaponTimer -= dt;
        if (weaponTimer <= 0) {
            activeWeapon = null;
            updatePowerUpUI();
        }
    }
}

// ===== WINGMAN SYSTEM =====
function createWingmen() {
    wingmen = [
        { x: 0, y: 0, width: 28, height: 18, color: '#0f0', side: 'left', cooldown: 0, maxCooldown: 0.35 },
        { x: 0, y: 0, width: 28, height: 18, color: '#0f0', side: 'right', cooldown: 0, maxCooldown: 0.35 }
    ];
}

function updateWingmen(dt) {
    if (!activePowerUps.WINGMAN) { wingmen = []; return; }
    if (wingmen.length === 0) createWingmen();
    
    wingmen.forEach(w => {
        if (w.side === 'left') {
            w.x = player.x - w.width - 10;
        } else {
            w.x = player.x + player.width + 10;
        }
        w.y = player.y + (player.height - w.height) / 2;
        
        w.cooldown -= dt;
        if (w.cooldown <= 0) {
            bullets.push({
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

function drawWingmen() {
    wingmen.forEach(w => {
        ctx.fillStyle = w.color;
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(w.x + w.width / 2, w.y);
        ctx.lineTo(w.x + w.width, w.y + w.height);
        ctx.lineTo(w.x, w.y + w.height);
        ctx.closePath();
        ctx.fill();
        // Engine glow
        ctx.fillStyle = themeColor('bullet');
        ctx.fillRect(w.x + w.width / 2 - 2, w.y + w.height, 4, 4);
        ctx.shadowBlur = 0;
    });
}

// ===== UFO SYSTEM =====
let ufo = null;
let ufoTimer = 0;
let ufoNextSpawn = 10 + Math.random() * 8;

function spawnUfo() {
    const direction = Math.random() < 0.5 ? -1 : 1;
    const startX = direction === 1 ? -60 : canvas.width + 60;
    ufo = {
        x: startX, y: 28,
        width: 48, height: 22,
        speed: 80 + level * 12,
        direction: direction,
        points: 50 + Math.floor(Math.random() * 50)
    };
    audio.playUfo();
}

function updateUfo(dt) {
    ufoTimer += dt;
    if (!ufo && ufoTimer >= ufoNextSpawn) {
        spawnUfo();
        ufoTimer = 0;
    }
    if (ufo) {
        ufo.x += ufo.speed * ufo.direction * dt;
        if ((ufo.direction === 1 && ufo.x > canvas.width + 70) ||
            (ufo.direction === -1 && ufo.x < -70)) {
            ufo = null;
            ufoNextSpawn = 8 + Math.random() * 12;
        }
    }
}

function drawUfo() {
    if (!ufo) return;
    const x = ufo.x, y = ufo.y, w = ufo.width, h = ufo.height;
    ctx.fillStyle = '#f0f';
    ctx.shadowColor = '#f0f';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 3, w / 5, h / 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// ===== BOSS SYSTEM =====
let boss = null;
let bossDefeated = false;
let minions = [];

function getBossType(level) {
    const types = ['DESTROYER', 'CARRIER', 'ARTILLERY'];
    return types[Math.floor((level - 3) / 3) % 3];
}

function getBossHp(level, type) {
    const base = 25 + (level - 3) * 10;
    const mult = type === 'DESTROYER' ? 2.2 : type === 'CARRIER' ? 1.4 : 1.7;
    return Math.floor(base * mult);
}

function spawnBoss() {
    const type = getBossType(level);
    const hp = getBossHp(level, type);
    const base = {
        x: canvas.width / 2 - 70,
        y: 35,
        width: 140,
        height: 70,
        type: type,
        hp: hp,
        maxHp: hp,
        points: 300 + level * 80,
        rage: false,
        rageFlash: 0
    };
    const loopSpeedMult = Math.min(1.0 + loopCount * 0.2, 2.5);
    if (type === 'DESTROYER') {
        boss = {
            ...base,
            speed: (45 + (level - 3) * 3) * loopSpeedMult,
            direction: 1,
            shootTimer: 0,
            shootInterval: Math.max(0.1, (1.4 - (level - 3) * 0.08) / loopSpeedMult),
            moveTimer: 0,
            phase: 'MOVE',
            phaseTimer: 0,
            laserHitPlayer: false,
            spreadBonus: 0,
            cannonTelegraph: 0
        };
    } else if (type === 'CARRIER') {
        boss = {
            ...base,
            speed: 30 * loopSpeedMult,
            direction: 1,
            spawnTimer: 0,
            spawnInterval: Math.max(0.1, (2.0 - (level - 3) * 0.06) / loopSpeedMult),
            moveTimer: 0,
            minionCount: 2
        };
    } else {
        boss = {
            ...base,
            shootTimer: 0,
            shootInterval: Math.max(0.1, (0.9 - (level - 3) * 0.04) / loopSpeedMult),
            burstTimer: 0,
            burstInterval: Math.max(0.1, (4.0 - (level - 3) * 0.1) / loopSpeedMult),
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

function checkBossRage() {
    if (!boss || boss.rage || boss.hp <= 0) return;
    if (boss.hp / boss.maxHp <= 0.3) {
        boss.rage = true;
        triggerShake(6);
        spawnFloatingText(boss.x + boss.width / 2, boss.y - 20, '😤 ENRAGED!', '#f00');
        audio.playExplosion();
        // Apply rage modifiers
        if (boss.type === 'DESTROYER') {
            boss.shootInterval = Math.max(0.1, boss.shootInterval * 0.67);
            boss.spreadBonus = 1;
        } else if (boss.type === 'CARRIER') {
            boss.spawnInterval = Math.max(0.1, boss.spawnInterval * 0.67);
            boss.minionCount = 3;
        } else if (boss.type === 'ARTILLERY') {
            boss.shootInterval = Math.max(0.1, boss.shootInterval * 0.67);
            boss.burstInterval = Math.max(0.1, boss.burstInterval * 0.67);
            boss.burstCount = 14;
            boss.jitterAmp = 40;
        }
    }
}

function drawBossRageOverlay(x, y, w, h) {
    if (!boss || !boss.rage) return;
    const pulse = 0.25 + Math.sin(Date.now() / 80) * 0.15;
    ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
    ctx.fillRect(x, y, w, h);
}

// ===== MINION SYSTEM =====
function spawnMinion(x, y) {
    minions.push({
        x: x, y: y,
        width: 20, height: 15,
        speed: 140 + level * 10,
        color: '#0f0',
        hp: 1,
        alive: true,
        points: 15
    });
}

function updateMinions(dt) {
    for (let i = minions.length - 1; i >= 0; i--) {
        const m = minions[i];
        if (!m.alive) { minions.splice(i, 1); continue; }
        m.y += m.speed * dt;
        m.x += (player.x - m.x) * 1.2 * dt;
        if (m.y > canvas.height + 20) {
            m.alive = false;
        }
    }
}

function drawMinions() {
    const minionColor = themeColor('minion');
    minions.forEach(m => {
        if (!m.alive) return;
        ctx.fillStyle = minionColor;
        ctx.shadowColor = minionColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(m.x + m.width / 2, m.y + m.height);
        ctx.lineTo(m.x + m.width, m.y);
        ctx.lineTo(m.x, m.y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    });
}

// ===== DESTROYER =====
function updateBoss_DESTROYER(dt) {
    const b = boss;
    b.phaseTimer += dt;

    // Handle cannon telegraph
    if (b.cannonTelegraph > 0) {
        b.cannonTelegraph -= dt;
        if (b.cannonTelegraph <= 0) {
            const spread = Math.min(4, 1 + Math.floor((level - 3) / 2)) + (b.spreadBonus || 0);
            for (let s = -spread; s <= spread; s++) {
                bombs.push({
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
                delete activePowerUps.SHIELD;
                player.shield = false;
                b.laserHitPlayer = true;
                updatePowerUpUI();
            } else if (!playerInvincible()) {
                b.laserHitPlayer = true;
                aceStreak = 0;
                lastDamageTime = 0;
                lives--;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#f00', 25);
                audio.playExplosion();
                triggerShake(10);
                if (lives <= 0) endGame();
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

function drawBoss_DESTROYER() {
    const x = boss.x, y = boss.y, w = boss.width, h = boss.height;
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
    drawBossRageOverlay(x, y, w, h);
    ctx.shadowBlur = 0;

    // Cannon telegraph
    if (boss.cannonTelegraph > 0 && boss.phase === 'MOVE') {
        const pulse = 0.5 + Math.sin(Date.now() / 40) * 0.5;
        ctx.fillStyle = `rgba(255, 200, 0, ${pulse})`;
        ctx.fillRect(x + w * 0.05, y + h * 0.55, w * 0.08, h * 0.08);
        ctx.fillRect(x + w * 0.87, y + h * 0.55, w * 0.08, h * 0.08);
    }

    if (boss.phase === 'CHARGE') {
        const alpha = 0.3 + Math.sin(Date.now() / 60) * 0.25;
        ctx.strokeStyle = `rgba(255, 255, 0, ${Math.max(0.1, alpha)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y + h * 0.75);
        ctx.lineTo(canvas.width, y + h * 0.75);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (boss.phase === 'LASER') {
        ctx.fillStyle = 'rgba(255, 50, 0, 0.7)';
        ctx.shadowColor = '#f80';
        ctx.shadowBlur = 25;
        const beamH = boss.rage ? 24 : 12;
        const coreH = boss.rage ? 8 : 4;
        ctx.fillRect(0, y + h * 0.72, canvas.width, beamH);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, y + h * 0.74, canvas.width, coreH);
        ctx.shadowBlur = 0;
    }
}

// ===== CARRIER =====
function updateBoss_CARRIER(dt) {
    const b = boss;
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

function drawBoss_CARRIER() {
    const x = boss.x, y = boss.y, w = boss.width, h = boss.height;
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
    drawBossRageOverlay(x, y, w, h);
    ctx.shadowBlur = 0;
}

// ===== ARTILLERY =====
function updateBoss_ARTILLERY(dt) {
    const b = boss;
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
                bombs.push({
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
            bombs.push({
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

function drawBoss_ARTILLERY() {
    const x = boss.x, y = boss.y, w = boss.width, h = boss.height;
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
    drawBossRageOverlay(x, y, w, h);
    ctx.shadowBlur = 0;

    // Aim telegraph reticle
    if (boss.aimTelegraph > 0) {
        const rx = boss.aimTargetX;
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
function updateBoss(dt) {
    if (!boss) return;
    if (boss.type === 'DESTROYER') updateBoss_DESTROYER(dt);
    else if (boss.type === 'CARRIER') updateBoss_CARRIER(dt);
    else updateBoss_ARTILLERY(dt);

    if (boss && !playerInvincible() && boss.y + boss.height >= player.y) {
        lives = 0;
        wavePerfect = false;
        updateUI();
        endGame();
    }
}

function drawBoss() {
    if (!boss) return;
    drawBossHpBar();
    if (boss.type === 'DESTROYER') drawBoss_DESTROYER();
    else if (boss.type === 'CARRIER') drawBoss_CARRIER();
    else drawBoss_ARTILLERY();
}

function drawBossHpBar() {
    if (!boss) return;
    const x = boss.x, w = boss.width;
    const barW = w * 0.7;
    const barH = 7;
    const barX = x + w * 0.15;
    const barY = boss.y - 14;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = boss.hp > boss.maxHp * 0.4 ? '#0f0' : '#f00';
    ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(boss.type, x + w / 2, barY - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// ===== PLAYER =====
const player = {
    x: 0, y: 0,
    width: 40, height: 25,
    speed: 300,
    color: '#0f0',
    cooldown: 0,
    baseCooldown: 0.25,
    shield: false,
    initTime: 0,

    init() {
        const ship = SHIP_CLASSES[selectedShipKey];
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 28;
        this.shield = false;
        this.initTime = 0;
        this.speed = 300 * ship.speedMult * (1 + upgrades.speedBonus * 0.2);
        this.baseCooldown = getFireRateCooldown() / ship.fireRateMult;
        this.color = ship.color;
        // Reset ship passive state
        aceStreak = 0;
        aceActive = false;
        aceTimer = 0;
        salvoCounter = 0;
        lastDamageTime = 0;
        phaseShiftCooldown = 0;
        phaseShiftTimer = 0;
        lastKeyTapTime = { left: 0, right: 0 };
    },

    getCooldown() {
        return activePowerUps.RAPID_FIRE ? 0.07 : this.baseCooldown;
    },

    update(dt) {
        this.initTime += dt;
        if (keys['ArrowLeft'] || keys['a'] || touchInput.left) {
            this.x -= this.speed * dt;
        }
        if (keys['ArrowRight'] || keys['d'] || touchInput.right) {
            this.x += this.speed * dt;
        }
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

        if (this.cooldown > 0) this.cooldown -= dt;
        if (touchInput.fire && this.cooldown <= 0) {
            this.shoot();
        }
        this.shield = !!activePowerUps.SHIELD;

        // Vanguard: regenerative plating
        if (selectedShipKey === 'VANGUARD' && !playerInvincible()) {
            lastDamageTime += dt;
            if (lastDamageTime >= 6 && !this.shield) {
                applyPowerUp('SHIELD');
                spawnFloatingText(this.x + this.width / 2, this.y - 20, '♻️ REGEN!', '#08f');
            }
        }

        // Ace Time decay
        if (aceActive) {
            aceTimer -= dt;
            if (aceTimer <= 0) {
                aceActive = false;
                aceTimer = 0;
            }
        }

        // Phase Shift timers
        if (phaseShiftTimer > 0) phaseShiftTimer -= dt;
        if (phaseShiftCooldown > 0) phaseShiftCooldown -= dt;
    },

    shoot() {
        if (this.cooldown > 0) return;
        const cx = this.x + this.width / 2;
        const cy = this.y;
        const shipColor = SHIP_CLASSES[selectedShipKey].color;
        const acePierce = aceActive;
        if (activeWeapon === 'SPREAD') {
            const angles = [-260, -130, 0, 130, 260];
            angles.forEach(a => bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: WEAPON_TYPES.SPREAD.color, dx: a, trail: [], acePierce }));
        } else if (activeWeapon === 'PIERCE') {
            bullets.push({ x: cx, y: cy, width: 3, height: 14, speed: 650, color: WEAPON_TYPES.PIERCE.color, dx: 0, trail: [], type: 'PIERCE', acePierce });
        } else if (activeWeapon === 'HOMING') {
            bullets.push({ x: cx, y: cy, width: 5, height: 10, speed: 420, color: WEAPON_TYPES.HOMING.color, dx: 0, trail: [], type: 'HOMING', acePierce });
        } else if (activeWeapon === 'NUKE') {
            bullets.push({ x: cx, y: cy, width: 5, height: 14, speed: 480, color: WEAPON_TYPES.NUKE.color, dx: 0, trail: [], type: 'NUKE', acePierce });
        } else if (activePowerUps.MULTI_SHOT) {
            bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 0, trail: [], acePierce });
            bullets.push({ x: cx - 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: -130, trail: [], acePierce });
            bullets.push({ x: cx + 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 130, trail: [], acePierce });
        } else {
            if (selectedShipKey === 'HARBINGER') {
                harbingerShotCounter++;
                if (harbingerShotCounter >= 4) {
                    harbingerShotCounter = 0;
                    singularities.push({ x: cx, y: cy, radius: 50, timer: 2.5, pullForce: 80 });
                } else {
                    bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
                }
            } else if (selectedShipKey === 'TITAN') {
                salvoCounter++;
                if (salvoCounter >= 6) {
                    salvoCounter = 0;
                    bullets.push({ x: cx, y: cy, width: 6, height: 14, speed: 380, color: '#f80', dx: 0, trail: [], type: 'SALVO', acePierce });
                    spawnFloatingText(cx, cy - 15, '💥 SALVO!', '#f80');
                } else {
                    bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
                }
            } else {
                bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: shipColor, dx: 0, trail: [], acePierce });
            }
        }
        audio.playShoot();
        this.cooldown = this.getCooldown();
    },

    draw() {
        // Spawn / respawn invulnerability flash
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
};

function playerInvincible() {
    return player.initTime < 2 || (selectedShipKey === 'SPECTRE' && phaseShiftTimer > 0);
}

function respawnPlayer() {
    player.initTime = 0;
    player.x = canvas.width / 2 - player.width / 2;
    // Clear bombs near respawn area to prevent instant re-death
    bombs = bombs.filter(b => b.y < player.y - 30 || Math.abs(b.x - (player.x + player.width / 2)) > 70);
}

// ===== BULLETS =====
let bullets = [];

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // Update trail
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();

        // Homing behavior
        if (b.type === 'HOMING') {
            let nearest = null;
            let nearestDist = Infinity;
            for (let alien of aliens) {
                if (!alien.alive) continue;
                const d = Math.hypot(alien.x + alien.width/2 - b.x, alien.y + alien.height/2 - b.y);
                if (d < nearestDist) { nearestDist = d; nearest = alien; }
            }
            if (boss) {
                const d = Math.hypot(boss.x + boss.width/2 - b.x, boss.y + boss.height/2 - b.y);
                if (d < nearestDist) { nearestDist = d; nearest = boss; }
            }
            if (nearest) {
                const tx = nearest.x + (nearest.width || 0) / 2;
                const turn = (tx - b.x) * 3;
                b.dx = (b.dx || 0) + (turn - (b.dx || 0)) * 5 * dt;
                b.dx = Math.max(-200, Math.min(200, b.dx));
            }
        }

        b.y -= b.speed * dt;
        b.x += (b.dx || 0) * dt;

        // Check bunker collision (player bullets destroy bunkers)
        // Pierce bullets pass through bunkers
        if (b.type !== 'PIERCE') {
            for (let brick of bunkers) {
                if (!brick.alive) continue;
                if (b.x - b.width/2 < brick.x + brick.width && b.x + b.width/2 > brick.x &&
                    b.y < brick.y + brick.height && b.y + b.height > brick.y) {
                    brick.alive = false;
                    createExplosion(brick.x + brick.width/2, brick.y + brick.height/2, '#0a0', 5);
                    triggerShake(1);
                    bullets.splice(i, 1);
                    break;
                }
            }
        }

        if (bullets[i] && (bullets[i].y < -bullets[i].height || bullets[i].x < -50 || bullets[i].x > canvas.width + 50)) {
            bullets.splice(i, 1);
        }
    }
}

function drawTrail(trail, color, width) {
    if (trail.length < 2) return;
    for (let i = 0; i < trail.length - 1; i++) {
        const alpha = (i / trail.length) * 0.35;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(trail[i].x - width/2, trail[i].y, width, 3);
    }
    ctx.globalAlpha = 1;
}

function drawBullets() {
    bullets.forEach(b => {
        drawTrail(b.trail, b.color, b.width * 1.5);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x - b.width / 2, b.y, b.width, b.height);
        ctx.shadowBlur = 0;
    });
}

// ===== BOMBS =====
let bombs = [];

function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        b.y += (b.speed + (b.dy || 0)) * dt;
        b.x += (b.dx || 0) * dt;

        // Check bunker collision (enemy bombs destroy bunkers)
        for (let brick of bunkers) {
            if (!brick.alive) continue;
            const b = bombs[i];
            if (b.x - b.width/2 < brick.x + brick.width && b.x + b.width/2 > brick.x &&
                b.y < brick.y + brick.height && b.y + b.height > brick.y) {
                brick.alive = false;
                createExplosion(brick.x + brick.width/2, brick.y + brick.height/2, '#0a0', 5);
                bombs.splice(i, 1);
                break;
            }
        }

        if (bombs[i] && (bombs[i].y > canvas.height || bombs[i].x < -50 || bombs[i].x > canvas.width + 50)) {
            bombs.splice(i, 1);
        }
    }
}

function drawBombs() {
    const bombColor = themeColor('bomb');
    bombs.forEach(b => {
        drawTrail(b.trail, bombColor, b.width * 1.5);
        ctx.fillStyle = bombColor;
        ctx.shadowColor = bombColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x - b.width / 2, b.y, b.width, b.height);
        ctx.shadowBlur = 0;
    });
}

// ===== ALIENS =====
let aliens = [];
let alienDirection = 1;
let alienSpeed = 30;
let alienDropDistance = 14;
let alienMoveTimer = 0;
let alienShootTimer = 0;
let levelConfig = null;
let diveBomberTimer = 0;
let diveBomberCooldown = 7 + Math.random() * 4;

// ===== LEADERBOARD =====
let leaderboard = JSON.parse(localStorage.getItem('si_leaderboard')) || [];

function getLeaderboardRank(score) {
    for (let i = 0; i < leaderboard.length; i++) {
        if (score > leaderboard[i].score) return i;
    }
    return leaderboard.length < 5 ? leaderboard.length : -1;
}

function saveLeaderboard(name, score) {
    const entry = {
        name: name.toUpperCase().substring(0, 3) || 'AAA',
        score: score,
        level: level,
        date: new Date().toLocaleDateString()
    };
    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 5);
    localStorage.setItem('si_leaderboard', JSON.stringify(leaderboard));
    return leaderboard.findIndex(e => e === entry);
}

function renderLeaderboard(highlightIndex = -1) {
    const table = document.getElementById('lbTable');
    table.innerHTML = '';
    if (leaderboard.length === 0) {
        table.innerHTML = '<div class="lb-row"><span style="color:#888">No scores yet. Be the first!</span></div>';
        return;
    }
    leaderboard.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (i === highlightIndex ? ' highlight' : '');
        row.innerHTML = `
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-name">${entry.name}</span>
            <span class="lb-score">${entry.score}</span>
        `;
        table.appendChild(row);
    });
}

const nameEntryScreen = document.getElementById('nameEntryScreen');
const leaderboardScreen = document.getElementById('leaderboardScreen');
const nameInput = document.getElementById('nameInput');

document.getElementById('nameSubmitBtn').addEventListener('click', () => {
    const name = nameInput.value;
    const scoreVal = parseInt(document.getElementById('entryScore').textContent);
    const highlightIdx = saveLeaderboard(name, scoreVal);
    nameEntryScreen.classList.add('hidden');
    renderLeaderboard(highlightIdx);
    leaderboardScreen.classList.remove('hidden');
});

document.getElementById('lbPlayBtn').addEventListener('click', () => {
    leaderboardScreen.classList.add('hidden');
    startGame();
});

document.getElementById('lbMenuBtn').addEventListener('click', () => {
    leaderboardScreen.classList.add('hidden');
    gameState = 'menu';
    startScreen.classList.remove('hidden');
    renderMenuBackground();
});

document.getElementById('lbBtnStart').addEventListener('click', () => {
    renderLeaderboard();
    leaderboardScreen.classList.remove('hidden');
});

function getLevelConfig(level) {
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

function createAliens() {
    // Boss every 3rd level starting at level 3
    if (level >= 3 && (level - 3) % 3 === 0) {
        boss = null;
        spawnBoss();
        aliens = [];
        levelConfig = { rows: 0, cols: 0, speed: 0, shootBase: 0.5 };
        return;
    }
    boss = null;
    aliens = [];
    levelConfig = getLevelConfig(level);
    const cols = levelConfig.cols;
    const rows = levelConfig.rows;
    const alienWidth = 22;
    const alienHeight = 16;
    const padding = 15;
    const startX = (canvas.width - (cols * (alienWidth + padding) - padding)) / 2;
    const startY = Math.min(45 + (level - 1) * 5, 85);

    const colors = themeColor('alienRows');

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const typeKey = pickAlienType(level);
            const typeData = ALIEN_TYPES[typeKey];
            aliens.push({
                x: startX + c * (alienWidth + padding),
                y: startY + r * (alienHeight + padding),
                width: alienWidth,
                height: alienHeight,
                color: colors[r % colors.length],
                points: Math.floor((rows - r) * 10 * typeData.pointsMult),
                alive: true,
                special: false,
                type: typeKey,
                hp: typeData.hp + Math.min(loopCount, 4),
                maxHp: typeData.hp + Math.min(loopCount, 4),
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
    const aliveIndices = aliens.map((a, i) => i);
    const specialIdx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    aliens[specialIdx].special = true;
    aliens[specialIdx].points += 20; // Bonus points for special alien

    // Roll elites (~15% base chance, increased in loops)
    const eliteRate = Math.min(0.15 + loopCount * 0.05, 0.80);
    const eliteKeys = Object.keys(ELITE_TYPES);
    for (let a of aliens) {
        if (Math.random() < eliteRate) {
            const eliteKey = eliteKeys[Math.floor(Math.random() * eliteKeys.length)];
            a.elite = eliteKey;
            a.points = Math.floor(a.points * ELITE_TYPES[eliteKey].pointsMult);
            if (eliteKey === 'SHIELDED') {
                a.shieldHp = 1;
            }
        }
    }

    alienSpeed = levelConfig.speed;

    // (removed rapid start — now purchased as instant rapid fire in shop)
}

function updateAliens(dt) {
    if (boss) {
        updateBoss(dt);
    } else {
    const aliveAliens = aliens.filter(a => a.alive);
    if (aliveAliens.length === 0 && !levelTransitioning) {
        nextLevel();
        return;
    }

    // Hazard event scheduler
    if (!eventTriggeredThisLevel && level >= 2 && !boss && !levelTransitioning) {
        const timeInLevel = (levelConfig.rows * levelConfig.cols - aliveAliens.length) * 0.5; // rough proxy
        if (timeInLevel > 2 && Math.random() < 0.008) { // ~25% chance over a typical level
            eventTriggeredThisLevel = true;
            const roll = Math.random();
            if (roll < 0.40) {
                activeEvent = { type: 'METEOR', timer: 10 };
                const count = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < count; i++) {
                    meteors.push({
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
                activeEvent = { type: 'EMP', timer: 2.5 };
                empActive = true;
                empTimer = 2.5;
            } else {
                activeEvent = { type: 'REINFORCEMENT', timer: 0 };
                const reinforceCount = 4 + Math.floor(Math.random() * 3);
                const rColors = themeColor('alienRows');
                const rWidth = 22, rPadding = 15;
                const rStartX = (canvas.width - (reinforceCount * (rWidth + rPadding) - rPadding)) / 2;
                for (let i = 0; i < reinforceCount; i++) {
                    aliens.push({
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
                        parachuteTargetY: Math.min(45 + (level - 1) * 5, 85) - 20
                    });
                }
            }
        }
    }

    // Update active event
    if (activeEvent) {
        activeEvent.timer -= dt;
        if (activeEvent.type === 'EMP') {
            empTimer -= dt;
            if (empTimer <= 0) {
                empActive = false;
                activeEvent = null;
            }
        } else if (activeEvent.type === 'METEOR') {
            if (activeEvent.timer <= 0 || meteors.filter(m => m.alive).length === 0) {
                activeEvent = null;
                meteors = [];
            }
        } else if (activeEvent.type === 'REINFORCEMENT') {
            if (!aliens.some(a => a.parachute)) {
                activeEvent = null;
            }
        }
    }

    let shouldDrop = false;
    const edgeMargin = 10;

    for (let alien of aliveAliens) {
        if (alienDirection === 1 && alien.x + alien.width >= canvas.width - edgeMargin) {
            shouldDrop = true;
            break;
        }
        if (alienDirection === -1 && alien.x <= edgeMargin) {
            shouldDrop = true;
            break;
        }
    }

    alienMoveTimer += dt;
    const moveInterval = Math.max(0.05, 0.92 - (aliveAliens.length / 70) - (level * 0.015));

    if (!empActive && alienMoveTimer >= moveInterval) {
        alienMoveTimer = 0;
        if (shouldDrop) {
            alienDirection *= -1;
            aliveAliens.forEach(a => { a.y += alienDropDistance; });
        } else {
            aliveAliens.forEach(a => { a.x += alienDirection * (alienSpeed * 0.5) * (a.elite === 'SPEEDSTER' ? 2.0 : 1.0); });
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
    for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        if (!m.alive) { meteors.splice(i, 1); continue; }
        m.y += m.speed * Math.cos(m.angle) * dt;
        m.x += m.speed * Math.sin(m.angle) * dt;
        // Bunker collision
        for (let brick of bunkers) {
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
            wavePerfect = false;
            if (player.shield) {
                delete activePowerUps.SHIELD;
                player.shield = false;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#08f', 22);
                audio.playHitShield();
                updatePowerUpUI();
            } else {
                aceStreak = 0;
                lastDamageTime = 0;
                lives--;
                const isFinal = lives <= 0;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                audio.playExplosion();
                triggerShake(isFinal ? 14 : 10);
                if (isFinal) {
                    setTimeout(() => endGame(), 700);
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
    if (!empActive) {
    for (let a of aliveAliens) {
        if (a.hitFlash > 0) a.hitFlash -= dt;
        if (a.telegraphTimer > 0) {
            a.telegraphTimer -= dt;
            if (a.telegraphTimer <= 0 && a.alive) {
                if (a.telegraphType === 'bomb') {
                    bombs.push({
                        x: a.x + a.width / 2,
                        y: a.y + a.height,
                        width: 4,
                        height: 8,
                        speed: 150 + Math.random() * 100 + level * 15,
                        trail: []
                    });
                } else if (a.telegraphType === 'dive') {
                    a.diving = true;
                    a.diveSpeed = (130 + level * 12) * (a.elite === 'SPEEDSTER' ? 2.0 : 1.0);
                }
                a.telegraphType = null;
            }
        }
    }
    }

    alienShootTimer += dt;
    const totalAliens = levelConfig ? levelConfig.rows * levelConfig.cols : 40;
    const shootInterval = Math.max(0.25, levelConfig.shootBase - (totalAliens - aliveAliens.length) * 0.03);
    if (alienShootTimer >= shootInterval) {
        alienShootTimer = 0;
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
    if (!hasDiver && level >= 2 && !boss) {
        diveBomberTimer += dt;
        if (diveBomberTimer >= diveBomberCooldown) {
            diveBomberTimer = 0;
            diveBomberCooldown = 6 + Math.random() * 5;
            const candidates = aliveAliens.filter(a => a.type !== 'TANK' && !a.special && a.width >= 20 && a.telegraphTimer <= 0);
            if (candidates.length > 0) {
                const diver = candidates[Math.floor(Math.random() * candidates.length)];
                diver.telegraphTimer = 0.40;
                diver.telegraphType = 'dive';
            }
        }
    }

    // Update dive bombers (paused during EMP)
    if (!empActive) {
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
                    delete activePowerUps.SHIELD;
                    player.shield = false;
                    updatePowerUpUI();
                } else {
                    lives--;
                    wavePerfect = false;
                    const isFinal = lives <= 0;
                    createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                    audio.playExplosion();
                    triggerShake(isFinal ? 14 : 10);
                    if (isFinal) {
                        setTimeout(() => endGame(), 700);
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
            lives = 0;
            wavePerfect = false;
            updateUI();
            endGame();
        }
    }
    aliens = aliens.filter(a => a.alive);
    }
}

function drawAliens() {
    if (boss) {
        drawBoss();
    } else {
    const pulse = Math.sin(Date.now() / 150) * 6 + 10;
    aliens.forEach(a => {
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

        // Fast aliens: slimmer body
        if (a.type === 'FAST') {
            ctx.fillRect(x + w * 0.3, y, w * 0.4, h * 0.35);
            ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.45);
            ctx.fillRect(x + w * 0.25, y + h * 0.8, w * 0.15, h * 0.2);
            ctx.fillRect(x + w * 0.6, y + h * 0.8, w * 0.15, h * 0.2);
            // Speed lines
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(x + w * 0.4, y - 3, w * 0.2, 2);
        }
        // Tank aliens: thicker armor frame
        else if (a.type === 'TANK') {
            ctx.fillRect(x + w * 0.15, y, w * 0.7, h * 0.35);
            ctx.fillRect(x, y + h * 0.3, w, h * 0.55);
            ctx.fillRect(x + w * 0.1, y + h * 0.85, w * 0.25, h * 0.15);
            ctx.fillRect(x + w * 0.65, y + h * 0.85, w * 0.25, h * 0.15);
            // Armor plate
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
            // HP dots
            const dotColor = a.hp === a.maxHp ? '#0f0' : a.hp === 2 ? '#ff0' : '#f00';
            ctx.fillStyle = dotColor;
            for (let d = 0; d < a.hp; d++) {
                ctx.fillRect(x + 4 + d * 6, y - 5, 4, 3);
            }
        }
        // Mini-grunts (from splitter elites)
        else if (w <= 10) {
            ctx.fillRect(x, y, w, h * 0.6);
            ctx.fillRect(x + w * 0.2, y + h * 0.6, w * 0.6, h * 0.4);
        }
        // Normal aliens
        else {
            ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.3);
            ctx.fillRect(x, y + h * 0.3, w, h * 0.5);
            ctx.fillRect(x + w * 0.15, y + h * 0.8, w * 0.2, h * 0.2);
            ctx.fillRect(x + w * 0.65, y + h * 0.8, w * 0.2, h * 0.2);
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

// ===== PARTICLES =====
let particles = [];

function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 280,
            vy: (Math.random() - 0.5) * 280,
            life: 0.4 + Math.random() * 0.5,
            color: color,
            size: Math.random() * 3 + 1
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

function drawMeteors() {
    meteors.forEach(m => {
        if (!m.alive) return;
        ctx.fillStyle = '#888';
        ctx.shadowColor = '#aaa';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(m.x + m.size / 2, m.y + m.size / 2, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Craters
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(m.x + m.size * 0.3, m.y + m.size * 0.35, m.size * 0.15, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawEmpOverlay() {
    if (!empActive) return;
    const alpha = 0.04 + Math.sin(Date.now() / 100) * 0.03;
    ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateSingularities(dt) {
    const eventHorizon = selectedShipKey === 'HARBINGER';
    for (let i = singularities.length - 1; i >= 0; i--) {
        const s = singularities[i];
        s.timer -= dt;
        s.y -= 60 * dt; // Drift upward slowly
        // Pull nearby aliens
        for (let alien of aliens) {
            if (!alien.alive) continue;
            const ax = alien.x + alien.width / 2;
            const ay = alien.y + alien.height / 2;
            const dist = Math.hypot(ax - s.x, ay - s.y);
            if (dist < s.radius && dist > 5) {
                const pull = s.pullForce * dt * (1 - dist / s.radius);
                alien.x += (s.x - ax) * pull / dist;
                alien.y += (s.y - ay) * pull / dist;
            }
            // Event Horizon: DOT damage to aliens inside
            if (eventHorizon && dist < s.radius * 0.5) {
                alien.hp -= dt; // 1 DPS
                alien.hitFlash = 0.1;
                if (alien.hp <= 0) {
                    alien.alive = false;
                    addComboKill();
                    const mult = Math.min(comboCount, COMBO_MAX);
                    const pts = alien.points * mult * (alien.diving ? 2 : 1);
                    score += pts;
                    credits += pts;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                    audio.playExplosion();
                    triggerShake(alien.type === 'TANK' ? 5 : 3);
                    if (alien.elite === 'SPLITTER') {
                        for (let sg = -1; sg <= 1; sg += 2) {
                            aliens.push({
                                x: alien.x + alien.width / 2 - 4, y: alien.y + alien.height,
                                width: 8, height: 8, color: '#f80', points: 5, alive: true, special: false,
                                type: 'NORMAL', hp: 1, maxHp: 1, zigzag: false, zigzagPhase: 0,
                                hitFlash: 0, diving: false, diveSpeed: 0, telegraphTimer: 0, telegraphType: null,
                                elite: null, shieldHp: 0
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
        // Event Horizon: pull bombs
        if (eventHorizon) {
            for (let bomb of bombs) {
                const dist = Math.hypot(bomb.x - s.x, bomb.y - s.y);
                if (dist < s.radius && dist > 5) {
                    const pull = s.pullForce * 0.5 * dt * (1 - dist / s.radius);
                    bomb.x += (s.x - bomb.x) * pull / dist;
                    bomb.y += (s.y - bomb.y) * pull / dist;
                }
            }
        }
        if (s.timer <= 0 || s.y < -50) {
            singularities.splice(i, 1);
        }
    }
}

function drawSingularities() {
    singularities.forEach(s => {
        const pulse = 0.3 + Math.sin(Date.now() / 60) * 0.2;
        ctx.fillStyle = `rgba(160, 0, 255, ${pulse})`;
        ctx.shadowColor = '#a0f';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(200, 100, 255, ${pulse + 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    });
}

// ===== COLLISIONS =====
function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

function applySalvoSplash(cx, cy) {
    const radius = 35;
    createExplosion(cx, cy, '#f80', 10);
    triggerShake(2);
    // Splash damage to aliens
    for (let alien of aliens) {
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
                const mult = Math.min(comboCount, COMBO_MAX);
                const aceMult = aceActive ? 2 : 1;
                const pts = alien.points * mult * (alien.diving ? 2 : 1) * aceMult;
                score += pts;
                credits += pts;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                audio.playExplosion();
                triggerShake(alien.type === 'TANK' ? 5 : 3);
                if (alien.elite === 'SPLITTER') {
                    for (let s = -1; s <= 1; s += 2) {
                        aliens.push({
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
    for (let m of minions) {
        if (!m.alive) continue;
        const mx = m.x + m.width / 2;
        const my = m.y + m.height / 2;
        if (Math.hypot(mx - cx, my - cy) < radius) {
            m.alive = false;
            addComboKill();
            const mult = Math.min(comboCount, COMBO_MAX);
            const aceMult = aceActive ? 2 : 1;
            const pts = m.points * mult * aceMult;
            score += pts;
            credits += pts;
            createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
            audio.playExplosion();
            triggerShake(2);
            spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
            updateUI();
        }
    }
}

function applyNukeSplash(cx, cy) {
    const radius = 55;
    createExplosion(cx, cy, WEAPON_TYPES.NUKE.color, 14);
    triggerShake(4);
    // Splash damage to aliens
    for (let alien of aliens) {
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
                const mult = Math.min(comboCount, COMBO_MAX);
                const pts = alien.points * mult * (alien.diving ? 2 : 1);
                score += pts;
                credits += pts;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                audio.playExplosion();
                triggerShake(alien.type === 'TANK' ? 5 : 3);
                if (alien.elite === 'SPLITTER') {
                    for (let s = -1; s <= 1; s += 2) {
                        aliens.push({
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
    for (let m of minions) {
        if (!m.alive) continue;
        const mx = m.x + m.width / 2;
        const my = m.y + m.height / 2;
        if (Math.hypot(mx - cx, my - cy) < radius) {
            m.alive = false;
            addComboKill();
            const mult = Math.min(comboCount, COMBO_MAX);
            const pts = m.points * mult;
            score += pts;
            credits += pts;
            createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
            audio.playExplosion();
            triggerShake(2);
            spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
            updateUI();
        }
    }
    // Splash damage to boss
    if (boss) {
        const bx = boss.x + boss.width / 2;
        const by = boss.y + boss.height / 2;
        if (Math.hypot(bx - cx, by - cy) < radius + 25) {
            boss.hp--;
            checkBossRage();
            createExplosion(cx, cy, '#f80', 6);
            triggerShake(3);
            if (boss.hp <= 0) {
                score += boss.points;
                credits += boss.points;
                createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#f00', 40);
                audio.playBonus();
                const typeLabel = boss.type === 'DESTROYER' ? 'DESTROYER' : boss.type === 'CARRIER' ? 'CARRIER' : 'ARTILLERY';
                spawnFloatingText(boss.x + boss.width/2, boss.y, `${typeLabel} DOWN! +${boss.points}`, '#ff0');
                spawnWeapon(boss.x + boss.width / 2, boss.y + boss.height);
                boss = null;
                audio.stopBGM();
                audio.startBGM();
                updateUI();
                setTimeout(() => { if (gameState === 'playing' && !levelTransitioning) nextLevel(); }, 1000);
            }
        }
    }
}

function checkCollisions() {
    // Bullets vs aliens & UFO
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const bulletRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };

        // Aliens
        const isPierce = b.type === 'PIERCE' || b.acePierce;
        const isSalvo = b.type === 'SALVO';
        for (let alien of aliens) {
            if (!alien.alive) continue;
            if (rectsOverlap(bulletRect, alien)) {
                // Shielded elite absorbs first hit
                if (alien.shieldHp > 0) {
                    alien.shieldHp--;
                    alien.hitFlash = 0.15;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, '#08f', 6);
                    triggerShake(2);
                    audio.playHitShield();
                    if (!isPierce) bullets.splice(i, 1);
                    if (!isPierce) break;
                    continue;
                }
                if (!isPierce) bullets.splice(i, 1);
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
                    const mult = Math.min(comboCount, COMBO_MAX);
                    const aceMult = aceActive ? 2 : 1;
                    const pts = alien.points * mult * (alien.diving ? 2 : 1) * aceMult;
                    score += pts;
                    credits += pts;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 30 : 20);
                    audio.playExplosion();
                    triggerShake(alien.type === 'TANK' ? 5 : 3);
                    // Elite splitter spawns mini-grunts
                    if (alien.elite === 'SPLITTER') {
                        for (let s = -1; s <= 1; s += 2) {
                            aliens.push({
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

        if (!bullets[i]) continue; // Bullet was consumed by alien hit

        // UFO
        if (ufo && bullets[i]) {
            const ufoRect = { x: ufo.x, y: ufo.y, width: ufo.width, height: ufo.height };
            if (rectsOverlap(bulletRect, ufoRect)) {
                if (!isPierce) bullets.splice(i, 1);
                if (b.type === 'NUKE') applyNukeSplash(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
                if (isSalvo) applySalvoSplash(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
                score += ufo.points;
                credits += ufo.points;
                createExplosion(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, '#f0f', 22);
                audio.playBonus();
                triggerShake(4);
                if (Math.random() < 0.3) spawnWeapon(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
                else spawnPowerUp(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
                ufo = null;
                ufoNextSpawn = 8 + Math.random() * 10;
                updateUI();
            }
        }

        // Minions
        for (let m of minions) {
            if (!m.alive || !bullets[i]) continue;
            const mRect = { x: m.x, y: m.y, width: m.width, height: m.height };
            if (rectsOverlap(bulletRect, mRect)) {
                if (!isPierce) bullets.splice(i, 1);
                m.alive = false;
                if (b.type === 'NUKE') applyNukeSplash(m.x + m.width / 2, m.y + m.height / 2);
                if (isSalvo) applySalvoSplash(m.x + m.width / 2, m.y + m.height / 2);
                addComboKill();
                const mult = Math.min(comboCount, COMBO_MAX);
                const aceMult = aceActive ? 2 : 1;
                const pts = m.points * mult * aceMult;
                score += pts;
                credits += pts;
                createExplosion(m.x + m.width / 2, m.y + m.height / 2, m.color, 10);
                audio.playExplosion();
                triggerShake(2);
                spawnFloatingText(m.x + m.width / 2, m.y, `+${pts}`, m.color);
                updateUI();
                if (!isPierce) break;
            }
        }

        if (!bullets[i]) continue; // Bullet was consumed by minion hit

        // Boss
        if (boss && bullets[i]) {
            const bossRect = { x: boss.x, y: boss.y, width: boss.width, height: boss.height };
            if (rectsOverlap(bulletRect, bossRect)) {
                if (!isPierce) bullets.splice(i, 1);
                boss.hp--;
                checkBossRage();
                const nukeHit = b.type === 'NUKE';
                if (nukeHit) applyNukeSplash(boss.x + boss.width / 2, boss.y + boss.height / 2);
                if (isSalvo) applySalvoSplash(boss.x + boss.width / 2, boss.y + boss.height / 2);
                createExplosion(b.x, b.y, '#f80', 8);
                triggerShake(3);
                if (boss && boss.hp <= 0) {
                    score += boss.points;
                    credits += boss.points;
                    createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#f00', 40);
                    audio.playBonus();
                    const typeLabel = boss.type === 'DESTROYER' ? 'DESTROYER' : boss.type === 'CARRIER' ? 'CARRIER' : 'ARTILLERY';
                    spawnFloatingText(boss.x + boss.width/2, boss.y, `${typeLabel} DOWN! +${boss.points}`, '#ff0');
                    spawnWeapon(boss.x + boss.width / 2, boss.y + boss.height);
                    boss = null;
                    audio.stopBGM();
                    audio.startBGM();
                    updateUI();
                    setTimeout(() => { if (gameState === 'playing' && !levelTransitioning) nextLevel(); }, 1000);
                }
                // Don't break — let other bullets process this frame
            }
        }
    }

    // Minions vs player
    for (let m of minions) {
        if (!m.alive) continue;
        if (rectsOverlap(m, player) && !playerInvincible()) {
            m.alive = false;
            createExplosion(m.x + m.width/2, m.y + m.height/2, '#f00', 15);
            audio.playExplosion();
            triggerShake(8);
            if (player.shield) {
                delete activePowerUps.SHIELD;
                player.shield = false;
                updatePowerUpUI();
            } else {
                lives--;
                wavePerfect = false;
                const isFinal = lives <= 0;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                audio.playExplosion();
                triggerShake(isFinal ? 14 : 10);
                if (isFinal) {
                    setTimeout(() => endGame(), 700);
                    break;
                } else {
                    respawnPlayer();
                }
            }
            updateUI();
        }
    }

    // Bombs vs player
    for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        const bombRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(bombRect, playerRect) && !playerInvincible()) {
            bombs.splice(i, 1);
            if (player.shield) {
                delete activePowerUps.SHIELD;
                player.shield = false;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#08f', 22);
                audio.playHitShield();
                updatePowerUpUI();
            } else {
                aceStreak = 0;
                lastDamageTime = 0;
                lives--;
                const isFinal = lives <= 0;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, isFinal ? '#ff0' : '#0f0', isFinal ? 45 : 25);
                audio.playExplosion();
                triggerShake(isFinal ? 14 : 10);
                if (isFinal) {
                    setTimeout(() => endGame(), 700);
                } else {
                    respawnPlayer();
                }
            }
            updateUI();
            break;
        }
    }

    // Power-ups vs player
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const pRect = { x: p.x, y: p.y, width: p.width, height: p.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(pRect, playerRect)) {
            applyPowerUp(p.type);
            powerUps.splice(i, 1);
        }
    }

    // Meteors vs player bullets
    for (let m of meteors) {
        if (!m.alive) continue;
        const mRect = { x: m.x, y: m.y, width: m.size, height: m.size };
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const bRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
            if (rectsOverlap(bRect, mRect)) {
                if (b.type !== 'PIERCE') bullets.splice(i, 1);
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
    for (let i = weapons.length - 1; i >= 0; i--) {
        const w = weapons[i];
        const wRect = { x: w.x, y: w.y, width: w.width, height: w.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(wRect, playerRect)) {
            applyWeapon(weapons[i].type);
            weapons.splice(i, 1);
        }
    }
}

// ===== UI =====
function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('credits').textContent = credits;
    document.getElementById('level').textContent = level;
    document.getElementById('highScore').textContent = highScore;

    const comboEl = document.getElementById('combo');
    const comboBox = document.getElementById('comboBox');
    comboEl.textContent = comboCount;
    comboBox.classList.remove('active', 'hot');
    if (comboCount >= 4) {
        comboBox.classList.add('hot');
    } else if (comboCount >= 2) {
        comboBox.classList.add('active');
    }
}

// ===== PAUSE SYSTEM =====
const pauseScreen = document.getElementById('pauseScreen');
const pauseBtn = document.getElementById('pauseBtn');
const shopBtn = document.getElementById('shopBtn');

function togglePause() {
    if (gameState === 'playing') {
        gameState = 'paused';
        screenShake = 0;
        audio.stopBGM();
        pauseScreen.classList.remove('hidden');
        shopBtn.classList.remove('visible');
    } else if (gameState === 'paused') {
        gameState = 'playing';
        pauseScreen.classList.add('hidden');
        audio.startBGM();
        lastTime = performance.now();
        gameLoop(lastTime);
        pauseBtn.classList.add('visible');
        shopBtn.classList.add('visible');
    }
}

document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('pauseShopBtn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    openShop(true);
});
shopBtn.addEventListener('click', () => {
    if (gameState === 'playing') {
        openShop(false, true);
    }
});
document.getElementById('quitBtn').addEventListener('click', () => {
    togglePause();
    gameState = 'menu';
    pauseScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    audio.stopBGM();
});
pauseBtn.addEventListener('click', togglePause);

window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (gameState === 'shop') {
            closeShop();
        } else if (gameState === 'playing' || gameState === 'paused') {
            togglePause();
        }
    }
});

// ===== SHOP SYSTEM =====
const shopScreen = document.getElementById('shopScreen');
const shopGrid = document.getElementById('shopGrid');
const shopScoreEl = document.getElementById('shopScore');

document.getElementById('shopContinueBtn').addEventListener('click', closeShop);

function renderShop() {
    shopScoreEl.textContent = credits;
    shopGrid.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const cost = item.getCost();
        const can = item.canBuy();
        const affordable = credits >= cost;
        const el = document.createElement('div');
        el.className = 'shop-item' + (can && affordable ? ' affordable' : '') + (!can ? ' maxed' : '');
        el.innerHTML = `
            <div class="info">
                <div class="name">${item.name}</div>
                <div class="desc">${item.desc}</div>
            </div>
            <div class="cost">${cost}</div>
            <button ${!can || !affordable ? 'disabled' : ''}>${!can ? 'MAXED' : 'BUY'}</button>
        `;
        const btn = el.querySelector('button');
        if (can && affordable) {
            btn.addEventListener('click', () => {
                credits -= cost;
                item.buy();
                audio.playPowerUp();
                updateUI();
                renderShop();
            });
        }
        shopGrid.appendChild(el);
    });
}

let shopFromPause = false;
let shopFromDirect = false;

function openShop(fromPause = false, fromDirect = false) {
    shopFromPause = fromPause;
    shopFromDirect = fromDirect;
    shopScreen.classList.remove('hidden');
    renderShop();
    pauseBtn.classList.remove('visible');
    shopBtn.classList.remove('visible');
    if (gameState === 'playing') {
        gameState = 'shop';
        audio.startShopBGM();
    }
}

function closeShop() {
    shopScreen.classList.add('hidden');
    if (shopFromPause) {
        gameState = 'paused';
        pauseScreen.classList.remove('hidden');
    } else if (shopFromDirect) {
        gameState = 'playing';
        lastTime = performance.now();
        gameLoop(lastTime);
        audio.startBGM();
        pauseBtn.classList.add('visible');
        shopBtn.classList.add('visible');
    } else {
        gameState = 'playing';
        proceedToNextLevel();
        lastTime = performance.now();
        gameLoop(lastTime);
        audio.startBGM();
    }
}

// ===== SCREENS & FLOW =====
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const shipSelectScreen = document.getElementById('shipSelectScreen');
const levelUpScreen = document.getElementById('levelUpScreen');
const finalScore = document.getElementById('finalScore');
const finalHighScore = document.getElementById('finalHighScore');
const unlockNotice = document.getElementById('unlockNotice');

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
    const muted = audio.toggleMute();
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', muted);
});

function showShipSelect() {
    getUnlockedShips();
    renderShipSelect();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    shipSelectScreen.classList.remove('hidden');
}

function renderMenuInfo() {
    const loopRecord = document.getElementById('loopRecord');
    if (loopRecord) {
        if (highestLoopReached > 0) {
            loopRecord.textContent = `🔁 Loop Record: ${highestLoopReached}`;
            loopRecord.classList.remove('hidden');
        } else {
            loopRecord.classList.add('hidden');
        }
    }
}

function renderThemeSwatches() {
    const container = document.getElementById('themeSwatches');
    if (!container) return;
    container.innerHTML = '';
    for (const key in THEMES) {
        const t = THEMES[key];
        const swatch = document.createElement('div');
        swatch.className = 'theme-swatch' + (key === currentTheme ? ' active' : '');
        swatch.style.backgroundColor = t.ui;
        swatch.title = t.name;
        swatch.addEventListener('click', () => {
            applyTheme(key);
            renderThemeSwatches();
        });
        container.appendChild(swatch);
    }
}

document.getElementById('startBtn').addEventListener('click', () => {
    audio.init();
    renderMenuInfo();
    showShipSelect();
});

// Show loop record on start screen
renderMenuInfo();
document.getElementById('restartBtn').addEventListener('click', showShipSelect);

// Loop buttons
function startLoop(nextLoop) {
    loopCount = nextLoop;
    carriedUpgrades = { ...upgrades };
    startGame();
}

function resetToLoop1() {
    loopCount = 0;
    carriedUpgrades = null;
    showShipSelect();
}

document.getElementById('loopContinueBtn').addEventListener('click', () => startLoop(loopCount + 1));
document.getElementById('loopResetBtn').addEventListener('click', resetToLoop1);

document.getElementById('shipBackBtn').addEventListener('click', () => {
    shipSelectScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});
document.getElementById('launchBtn').addEventListener('click', () => {
    shipSelectScreen.classList.add('hidden');
    startGame();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (gameState === 'menu') {
            audio.init();
            showShipSelect();
        } else if (gameState === 'gameover') {
            audio.init();
            showShipSelect();
        }
    }
});

// Reset stuck keys / touch when window loses focus
window.addEventListener('blur', () => {
    for (let k in keys) keys[k] = false;
    touchInput.left = false;
    touchInput.right = false;
    touchInput.fire = false;
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        for (let k in keys) keys[k] = false;
        touchInput.left = false;
        touchInput.right = false;
        touchInput.fire = false;
    }
});

// iOS Safari: resume AudioContext on first user interaction
function resumeAudioContext() {
    if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
    }
}
window.addEventListener('pointerdown', resumeAudioContext, { once: true });
window.addEventListener('touchstart', resumeAudioContext, { once: true });

function startGame() {
    const ship = SHIP_CLASSES[selectedShipKey];
    gameState = 'playing';
    score = 0;
    credits = 0;
    lives = ship.lives;
    level = 1;
    levelTransitioning = false;
    wavePerfect = true;
    comboCount = 0;
    comboTimer = 0;
    screenShake = 0;
    bullets = [];
    bombs = [];
    particles = [];
    floatingTexts = [];
    powerUps = [];
    weapons = [];
    activeWeapon = null;
    weaponTimer = 0;
    activePowerUps = {};
    wingmen = [];
    eventTriggeredThisLevel = false;
    activeEvent = null;
    empActive = false;
    empTimer = 0;
    meteors = [];
    singularities = [];
    harbingerShotCounter = 0;
    ufo = null;
    ufoTimer = 0;
    ufoNextSpawn = 10 + Math.random() * 8;
    boss = null;
    minions = [];
    alienDirection = 1;
    alienSpeed = 30;
    alienMoveTimer = 0;
    alienShootTimer = 0;
    diveBomberTimer = 0;
    diveBomberCooldown = 7 + Math.random() * 4;
    if (loopCount > 0 && carriedUpgrades) {
        upgrades = { ...carriedUpgrades };
    } else {
        upgrades = { speedBonus: 0, bunkerBonus: ship.bunkerBonus, comboBonus: 0, fireRateBonus: 0 };
    }

    player.init();
    if (ship.startPowerUp) {
        applyPowerUp(ship.startPowerUp);
    }
    createAliens();
    createBunkers();
    updateUI();
    updatePowerUpUI();
    updatePassiveHUD();

    startScreen.classList.add('hidden');
    shipSelectScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    levelUpScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    nameEntryScreen.classList.add('hidden');
    leaderboardScreen.classList.add('hidden');
    pauseBtn.classList.add('visible');
    shopBtn.classList.add('visible');

    audio.startBGM();
    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop(lastTime);
}

function proceedToNextLevel() {
    audio.playLevelUp();
    level++;
    boss = null;
    minions = [];
    bullets = [];
    bombs = [];
    powerUps = [];
    floatingTexts = [];
    comboCount = 0;
    comboTimer = 0;
    wavePerfect = true;
    screenShake = 0;
    alienDirection = 1;
    levelConfig = getLevelConfig(level);
    alienSpeed = levelConfig.speed;
    alienMoveTimer = 0;
    alienShootTimer = 0;
    eventTriggeredThisLevel = false;
    activeEvent = null;
    empActive = false;
    empTimer = 0;
    meteors = [];
    weapons = [];
    particles = [];
    singularities = [];
    ufo = null;
    ufoTimer = 0;
    activeWeapon = null;
    weaponTimer = 0;
    wingmen = [];
    diveBomberTimer = 0;
    harbingerShotCounter = 0;

    document.getElementById('levelUpNum').textContent = level;
    levelUpScreen.classList.remove('hidden');

    setTimeout(() => {
        levelUpScreen.classList.add('hidden');
        createAliens();
        createBunkers();
        // Re-apply ship starting ability at each new level
        const ship = SHIP_CLASSES[selectedShipKey];
        if (ship.startPowerUp) {
            applyPowerUp(ship.startPowerUp);
        }
        levelTransitioning = false;
        if (gameState === 'playing') {
            pauseBtn.classList.add('visible');
            shopBtn.classList.add('visible');
        }
    }, 1500);

    updateUI();
}

function nextLevel() {
    if (levelTransitioning) return;
    levelTransitioning = true;

    // Wave perfect bonus
    if (wavePerfect) {
        score += 200;
        credits += 200;
        spawnFloatingText(canvas.width / 2, canvas.height / 2, 'PERFECT WAVE! +200', '#ff0');
        audio.playBonus();
    }

    // Shop after every 3rd level (boss levels are 3,6,9... shop appears after beating boss)
    if (level % 3 === 0) {
        openShop();
        return;
    }

    proceedToNextLevel();
}

function renderShipSelect() {
    const grid = document.getElementById('shipGrid');
    const stats = document.getElementById('shipStats');
    grid.innerHTML = '';
    getUnlockedShips();

    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        const unlocked = shipUnlocks.includes(key);
        const el = document.createElement('div');
        el.className = 'ship-card' + (unlocked ? ' unlocked' : '') + (key === selectedShipKey ? ' selected' : '');
        el.innerHTML = `
            <div class="icon">${unlocked ? ship.icon : '🔒'}</div>
            <div class="name">${ship.name}</div>
            ${unlocked ? '' : `<div class="lock">${ship.unlockScore} pts</div>`}
        `;
        if (unlocked) {
            el.addEventListener('click', () => {
                selectedShipKey = key;
                renderShipSelect();
            });
        }
        grid.appendChild(el);
    }

    const sel = SHIP_CLASSES[selectedShipKey];
    const best = shipBestScores[selectedShipKey] || 0;
    const bonusText = [];
    if (sel.bunkerBonus) bonusText.push('+🛡️row');
    if (sel.startPowerUp) bonusText.push('🎁' + sel.startPowerUp.replace('_', ' '));
    const passiveHtml = sel.passive ? `<div style="margin-top:6px;color:${sel.color};font-size:13px"><strong>${sel.passive.icon} ${sel.passive.name}</strong> — ${sel.passive.desc}</div>` : '';
    stats.innerHTML = `
        <strong style="color:${sel.color}">${sel.icon} ${sel.name}</strong>
        &nbsp;|&nbsp; ❤️${sel.lives} ⚡${(sel.speedMult * 100).toFixed(0)}% 🔫${(sel.fireRateMult * 100).toFixed(0)}%
        ${bonusText.length ? '&nbsp;|&nbsp; ' + bonusText.join(' ') : ''}
        &nbsp;|&nbsp; <span style="color:#888">Best:${best}</span>
        ${passiveHtml}
    `;
}

function endGame() {
    gameState = 'gameover';
    const prevBest = highScore;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('si_highScore', highScore);
    }
    // Update per-ship best score
    const prevShipBest = shipBestScores[selectedShipKey] || 0;
    if (score > prevShipBest) {
        shipBestScores[selectedShipKey] = score;
        saveShipProgress();
    }
    // Check for new unlocks
    const newUnlocks = checkNewUnlocks(prevBest);
    unlockNotice.innerHTML = '';
    unlockNotice.classList.add('hidden');
    if (newUnlocks.length > 0) {
        unlockNotice.innerHTML = newUnlocks.map(s => `🎉 New Ship Unlocked: <strong>${s.name}</strong>!`).join('<br>');
        unlockNotice.classList.remove('hidden');
    }

    // Loop progression
    const reachedLoopLevel = loopCount > 0 || level >= 12;
    if (level >= 12 && !loopUnlocked) {
        loopUnlocked = true;
        localStorage.setItem('si_loopUnlocked', 'true');
    }
    if (loopCount > 0 && loopCount > highestLoopReached) {
        highestLoopReached = loopCount;
        localStorage.setItem('si_highestLoop', highestLoopReached);
    }
    // Harbinger unlock after completing Loop 2
    if (loopCount >= 2 && !harbingerUnlocked) {
        harbingerUnlocked = true;
        localStorage.setItem('si_harbingerUnlocked', 'true');
        if (!shipUnlocks.includes('HARBINGER')) {
            shipUnlocks.push('HARBINGER');
            saveShipProgress();
        }
    }

    finalScore.textContent = score;
    finalHighScore.textContent = highScore;
    pauseBtn.classList.remove('visible');
    shopBtn.classList.remove('visible');
    audio.startShopBGM();

    // Show loop options if applicable
    const loopOptions = document.getElementById('loopOptions');
    const loopContinueBtn = document.getElementById('loopContinueBtn');
    if (loopUnlocked && level >= 12) {
        loopOptions.classList.remove('hidden');
        loopContinueBtn.textContent = loopCount > 0 ? `🔁 CONTINUE TO LOOP ${loopCount + 1}` : '🔁 START LOOP 2';
    } else {
        loopOptions.classList.add('hidden');
    }

    gameOverScreen.classList.remove('hidden');

    const rank = getLeaderboardRank(score);
    if (rank >= 0 && score > 0) {
        document.getElementById('entryRank').textContent = rank + 1;
        document.getElementById('entryScore').textContent = score;
        nameInput.value = 'AAA';
        // Don't show name entry immediately; let player choose loop option first
    }
}

// ===== MAIN LOOP =====
function drawLives() {
    const heartSize = 18;
    const gap = 6;
    const startX = 12;
    const startY = 12;
    const heartColor = themeColor('bomb');
    for (let i = 0; i < lives; i++) {
        const x = startX + i * (heartSize + gap);
        const y = startY;
        ctx.fillStyle = heartColor;
        ctx.shadowColor = heartColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        const topCurveHeight = heartSize * 0.3;
        ctx.moveTo(x + heartSize / 2, y + topCurveHeight);
        ctx.bezierCurveTo(x + heartSize / 2, y, x, y, x, y + topCurveHeight);
        ctx.bezierCurveTo(x, y + (heartSize + topCurveHeight) / 2, x + heartSize / 2, y + heartSize * 0.85, x + heartSize / 2, y + heartSize);
        ctx.bezierCurveTo(x + heartSize / 2, y + heartSize * 0.85, x + heartSize, y + (heartSize + topCurveHeight) / 2, x + heartSize, y + topCurveHeight);
        ctx.bezierCurveTo(x + heartSize, y, x + heartSize / 2, y, x + heartSize / 2, y + topCurveHeight);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawShipStatus() {
    const panelX = 10;
    const panelY = canvas.height - 50;
    const lineHeight = 16;
    let y = panelY;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px monospace';

    // Active power-ups
    for (let type in activePowerUps) {
        const p = POWERUP_TYPES[type];
        const timeLeft = activePowerUps[type];
        let label = p.label.split(' ')[0]; // icon only
        let text = timeLeft === -1 ? `${label} ON` : `${label} ${Math.ceil(timeLeft)}s`;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillText(text, panelX, y);
        ctx.shadowBlur = 0;
        y -= lineHeight;
    }

    // Permanent upgrades
    const upgradesList = [];
    if (upgrades.speedBonus > 0) upgradesList.push({ icon: '⚡', val: upgrades.speedBonus });
    if (upgrades.fireRateBonus > 0) upgradesList.push({ icon: '🔫', val: upgrades.fireRateBonus });
    if (upgrades.bunkerBonus > 0) upgradesList.push({ icon: '🛡', val: upgrades.bunkerBonus });
    if (upgrades.comboBonus > 0) upgradesList.push({ icon: '✦', val: upgrades.comboBonus });

    for (let u of upgradesList) {
        const text = `${u.icon} Lv${u.val}`;
        ctx.fillStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 6;
        ctx.fillText(text, panelX, y);
        ctx.shadowBlur = 0;
        y -= lineHeight;
    }
}

function gameLoop(timestamp) {
    if (gameState !== 'playing') return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    updateStars();
    player.update(dt);
    updateWingmen(dt);
    updateBullets(dt);
    updateSingularities(dt);
    updateAliens(dt);
    updateMinions(dt);
    updateBombs(dt);
    updateUfo(dt);
    updatePowerUps(dt);
    updateWeapons(dt);
    updateWeaponTimer(dt);
    updateParticles(dt);
    updateCombo(dt);
    updateFloatingTexts(dt);
    checkCollisions();
    updatePowerUpUI();
    updatePassiveHUD();

    applyShake();

    drawStars();
    drawLives();
    drawUfo();
    drawAliens();
    drawBunkers();
    drawBombs();
    drawMinions();
    player.draw();
    drawWingmen();
    drawBullets();
    drawPowerUps();
    drawWeapons();
    drawParticles();
    drawMeteors();
    drawEmpOverlay();
    drawSingularities();
    drawFloatingTexts();
    drawShipStatus();

    decayShake();

    animationId = requestAnimationFrame(gameLoop);
}

// Menu background
function renderMenuBackground() {
    if (gameState !== 'menu') return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateStars();
    drawStars();
    requestAnimationFrame(renderMenuBackground);
}
renderMenuBackground();

// Init high score display
document.getElementById('highScore').textContent = highScore;

// Init theme
applyTheme(currentTheme);
renderThemeSwatches();

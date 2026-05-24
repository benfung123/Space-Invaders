const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
        this.bgmNormal.loop = true;
        this.bgmBoss.loop = true;
        this.bgmNormal.volume = 0.35;
        this.bgmBoss.volume = 0.35;
        this.bgmNormal.preload = 'auto';
        this.bgmBoss.preload = 'auto';
        this.currentTrack = null;
    }

    toggleMute() {
        this.muted = !this.muted;
        this.bgmNormal.muted = this.muted;
        this.bgmBoss.muted = this.muted;
        if (this.muted) {
            this.stopBGM();
        } else if (gameState === 'playing') {
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

    startBGM() {
        if (this.muted) return;
        this.stopBGM();
        const track = boss ? this.bgmBoss : this.bgmNormal;
        const startPlaying = () => {
            track.currentTime = 0;
            track.play().catch(() => {});
            this.currentTrack = track;
        };
        if (track.readyState >= 2) {
            startPlaying();
        } else {
            const onReady = () => {
                startPlaying();
                track.removeEventListener('canplaythrough', onReady);
            };
            track.addEventListener('canplaythrough', onReady);
        }
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
        this.bgmNormal.pause();
        this.bgmBoss.pause();
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
let lastTime = 0;

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

// Responsive canvas sizing
function resizeCanvas() {
    const maxWidth = Math.min(900, window.innerWidth - 20);
    const maxHeight = window.innerWidth <= 768 ? window.innerHeight * 0.5 : window.innerHeight * 0.75;
    canvas.width = maxWidth;
    canvas.height = maxHeight;
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
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Touch controls
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const fireBtn = document.getElementById('fireBtn');

function setupTouchBtn(btn, key) {
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); touchInput[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); touchInput[key] = false; });
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
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// ===== POWER-UP SYSTEM =====
const POWERUP_TYPES = {
    RAPID_FIRE: { color: '#f0f', glow: '#f0f', label: '⚡ RAPID', duration: 8 },
    SHIELD:     { color: '#08f', glow: '#08f', label: '🛡️ SHIELD', duration: -1 },
    MULTI_SHOT: { color: '#ff0', glow: '#ff0', label: '🔱 MULTI', duration: 8 },
    WINGMAN: { color: '#0f0', glow: '#0f0', label: '✈️ WING', duration: 10 }
};

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
        ctx.fillStyle = '#0af';
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
    const base = 5 + (level - 3) * 3;
    const mult = type === 'DESTROYER' ? 1.5 : type === 'CARRIER' ? 0.7 : 1.0;
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
        points: 300 + level * 80
    };
    if (type === 'DESTROYER') {
        boss = {
            ...base,
            speed: 45 + (level - 3) * 3,
            direction: 1,
            shootTimer: 0,
            shootInterval: Math.max(0.35, 1.4 - (level - 3) * 0.08),
            moveTimer: 0,
            phase: 'MOVE',
            phaseTimer: 0,
            laserHitPlayer: false
        };
    } else if (type === 'CARRIER') {
        boss = {
            ...base,
            speed: 30,
            direction: 1,
            spawnTimer: 0,
            spawnInterval: Math.max(1.2, 2.0 - (level - 3) * 0.06),
            moveTimer: 0
        };
    } else {
        boss = {
            ...base,
            shootTimer: 0,
            shootInterval: Math.max(0.4, 0.9 - (level - 3) * 0.04),
            burstTimer: 0,
            burstInterval: Math.max(2.5, 4.0 - (level - 3) * 0.1),
            jitterOffset: 0,
            jitterTimer: 0
        };
    }
    audio.stopBGM();
    audio.startBGM();
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
    minions.forEach(m => {
        if (!m.alive) return;
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
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

    if (b.phase === 'MOVE') {
        b.moveTimer += dt;
        if (b.moveTimer >= 0.4) {
            b.moveTimer = 0;
            b.x += b.direction * b.speed * 0.4;
            if (b.x <= 10) { b.direction = 1; b.x = 10; }
            if (b.x + b.width >= canvas.width - 10) { b.direction = -1; b.x = canvas.width - b.width - 10; }
        }
        b.shootTimer += dt;
        if (b.shootTimer >= b.shootInterval) {
            b.shootTimer = 0;
            const spread = Math.min(4, 1 + Math.floor((level - 3) / 2));
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
            b.laserHitPlayer = true;
            if (player.shield) {
                delete activePowerUps.SHIELD;
                player.shield = false;
                updatePowerUpUI();
            } else {
                lives--;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#f00', 25);
                audio.playExplosion();
                triggerShake(10);
                if (lives <= 0) endGame();
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
    ctx.shadowBlur = 0;

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
        ctx.fillRect(0, y + h * 0.72, canvas.width, 12);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, y + h * 0.74, canvas.width, 4);
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
    ctx.shadowBlur = 0;
}

// ===== ARTILLERY =====
function updateBoss_ARTILLERY(dt) {
    const b = boss;
    b.jitterTimer += dt;
    if (b.jitterTimer >= 0.3) {
        b.jitterTimer = 0;
        b.jitterOffset = (Math.random() - 0.5) * 20;
    }
    b.x = canvas.width / 2 - b.width / 2 + b.jitterOffset;

    b.shootTimer += dt;
    if (b.shootTimer >= b.shootInterval) {
        b.shootTimer = 0;
        const targetX = player.x + player.width / 2;
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

    b.burstTimer += dt;
    if (b.burstTimer >= b.burstInterval) {
        b.burstTimer = 0;
        const count = 10;
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
    ctx.shadowBlur = 0;
}

// ===== DISPATCHERS =====
function updateBoss(dt) {
    if (!boss) return;
    if (boss.type === 'DESTROYER') updateBoss_DESTROYER(dt);
    else if (boss.type === 'CARRIER') updateBoss_CARRIER(dt);
    else updateBoss_ARTILLERY(dt);

    if (boss && boss.y + boss.height >= player.y) {
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
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 28;
        this.shield = false;
        this.initTime = 0;
        this.speed = 300 * (1 + upgrades.speedBonus * 0.2);
        this.baseCooldown = getFireRateCooldown();
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
    },

    shoot() {
        if (this.cooldown > 0) return;
        const cx = this.x + this.width / 2;
        const cy = this.y;
        if (activePowerUps.MULTI_SHOT) {
            bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 0, trail: [] });
            bullets.push({ x: cx - 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: -130, trail: [] });
            bullets.push({ x: cx + 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 130, trail: [] });
        } else {
            bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#0ff', dx: 0, trail: [] });
        }
        audio.playShoot();
        this.cooldown = this.getCooldown();
    },

    draw() {
        // Spawn invulnerability flash
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
        ctx.fillStyle = '#0af';
        ctx.fillRect(this.x + this.width / 2 - 3, this.y + this.height, 6, 6);
        ctx.shadowBlur = 0;
    }
};

// ===== BULLETS =====
let bullets = [];

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // Update trail
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();

        b.y -= b.speed * dt;
        b.x += (b.dx || 0) * dt;

        // Check bunker collision (player bullets destroy bunkers)
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

        if (bullets[i] && (bullets[i].y < -bullets[i].height || bullets[i].x < -30 || bullets[i].x > canvas.width + 30)) {
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
    bombs.forEach(b => {
        drawTrail(b.trail, '#f00', b.width * 1.5);
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f00';
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

    const colors = ['#f00', '#f80', '#ff0', '#0f0', '#0ff'];

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
                hp: typeData.hp,
                maxHp: typeData.hp,
                zigzag: typeData.zigzag,
                zigzagPhase: Math.random() * Math.PI * 2,
                hitFlash: 0,
                diving: false,
                diveSpeed: 0
            });
        }
    }

    // Pick one random alien to be the special power-up carrier
    const aliveIndices = aliens.map((a, i) => i);
    const specialIdx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    aliens[specialIdx].special = true;
    aliens[specialIdx].points += 20; // Bonus points for special alien

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

    if (alienMoveTimer >= moveInterval) {
        alienMoveTimer = 0;
        if (shouldDrop) {
            alienDirection *= -1;
            aliveAliens.forEach(a => { a.y += alienDropDistance; });
        } else {
            aliveAliens.forEach(a => { a.x += alienDirection * (alienSpeed * 0.5); });
        }
    }

    alienShootTimer += dt;
    const totalAliens = levelConfig ? levelConfig.rows * levelConfig.cols : 40;
    const shootInterval = Math.max(0.25, levelConfig.shootBase - (totalAliens - aliveAliens.length) * 0.03);
    if (alienShootTimer >= shootInterval) {
        alienShootTimer = 0;
        const shooters = [];
        const cols = levelConfig ? levelConfig.cols : 8;
        const rows = levelConfig ? levelConfig.rows : 5;
        for (let c = 0; c < cols; c++) {
            let bottomAlien = null;
            for (let r = rows - 1; r >= 0; r--) {
                const idx = r * cols + c;
                if (aliens[idx] && aliens[idx].alive) {
                    bottomAlien = aliens[idx];
                    break;
                }
            }
            if (bottomAlien) shooters.push(bottomAlien);
        }
        if (shooters.length > 0) {
            const shooter = shooters[Math.floor(Math.random() * shooters.length)];
            bombs.push({
                x: shooter.x + shooter.width / 2,
                y: shooter.y + shooter.height,
                width: 4,
                height: 8,
                speed: 150 + Math.random() * 100 + level * 15,
                trail: []
            });
        }
    }

    // Dive bomber trigger
    const hasDiver = aliveAliens.some(a => a.diving);
    if (!hasDiver && level >= 2 && !boss) {
        diveBomberTimer += dt;
        if (diveBomberTimer >= diveBomberCooldown) {
            diveBomberTimer = 0;
            diveBomberCooldown = 6 + Math.random() * 5;
            const candidates = aliveAliens.filter(a => a.type !== 'TANK' && !a.special);
            if (candidates.length > 0) {
                const diver = candidates[Math.floor(Math.random() * candidates.length)];
                diver.diving = true;
                diver.diveSpeed = 130 + level * 12;
            }
        }
    }

    // Update dive bombers
    aliveAliens.forEach(a => {
        if (a.diving) {
            a.y += a.diveSpeed * dt;
            a.x += (player.x - a.x) * 1.2 * dt;
        }
    });

    // Check dive bomber collisions
    for (let alien of aliveAliens) {
        if (alien.diving) {
            // Hit player directly
            if (rectsOverlap(alien, player)) {
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
                    if (lives <= 0) {
                        endGame();
                        return;
                    }
                }
                updateUI();
                continue;
            }
            // Off screen
            if (alien.y > canvas.height + 20) {
                alien.alive = false;
            }
        } else if (alien.y + alien.height >= player.y) {
            lives = 0;
            wavePerfect = false;
            updateUI();
            endGame();
        }
    }
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
        // Normal aliens
        else {
            ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.3);
            ctx.fillRect(x, y + h * 0.3, w, h * 0.5);
            ctx.fillRect(x + w * 0.15, y + h * 0.8, w * 0.2, h * 0.2);
            ctx.fillRect(x + w * 0.65, y + h * 0.8, w * 0.2, h * 0.2);
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

// ===== COLLISIONS =====
function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

function checkCollisions() {
    // Bullets vs aliens & UFO
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const bulletRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };

        // Aliens
        for (let alien of aliens) {
            if (!alien.alive) continue;
            if (rectsOverlap(bulletRect, alien)) {
                bullets.splice(i, 1);
                alien.hp--;
                alien.hitFlash = 0.12;
                triggerShake(alien.type === 'TANK' ? 3 : 2);
                if (alien.hp <= 0) {
                    alien.alive = false;
                    addComboKill();
                    const mult = Math.min(comboCount, COMBO_MAX);
                    const pts = alien.points * mult * (alien.diving ? 2 : 1);
                    score += pts;
                    credits += pts;
                    createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.special ? '#fff' : alien.color, alien.special ? 22 : 15);
                    audio.playExplosion();
                    triggerShake(alien.type === 'TANK' ? 5 : 3);
                    if (alien.special) {
                        spawnPowerUp(alien.x + alien.width / 2, alien.y + alien.height);
                    }
                    const ftText = mult > 1 ? `+${pts} ×${mult}` : `+${pts}`;
                    spawnFloatingText(alien.x + alien.width / 2, alien.y, ftText, alien.special ? '#fff' : alien.color);
                    updateUI();
                }
                break;
            }
        }

        // UFO
        if (ufo && bullets[i]) {
            const ufoRect = { x: ufo.x, y: ufo.y, width: ufo.width, height: ufo.height };
            if (rectsOverlap(bulletRect, ufoRect)) {
                bullets.splice(i, 1);
                score += ufo.points;
                credits += ufo.points;
                createExplosion(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, '#f0f', 22);
                audio.playBonus();
                triggerShake(4);
                spawnPowerUp(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
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
                bullets.splice(i, 1);
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
                break;
            }
        }

        // Boss
        if (boss && bullets[i]) {
            const bossRect = { x: boss.x, y: boss.y, width: boss.width, height: boss.height };
            if (rectsOverlap(bulletRect, bossRect)) {
                bullets.splice(i, 1);
                boss.hp--;
                createExplosion(b.x, b.y, '#f80', 8);
                triggerShake(3);
                if (boss.hp <= 0) {
                    score += boss.points;
                    credits += boss.points;
                    createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#f00', 40);
                    audio.playBonus();
                    const typeLabel = boss.type === 'DESTROYER' ? 'DESTROYER' : boss.type === 'CARRIER' ? 'CARRIER' : 'ARTILLERY';
                    spawnFloatingText(boss.x + boss.width/2, boss.y, `${typeLabel} DOWN! +${boss.points}`, '#ff0');
                    boss = null;
                    audio.stopBGM();
                    audio.startBGM();
                    updateUI();
                    setTimeout(() => { if (gameState === 'playing' && !levelTransitioning) nextLevel(); }, 1000);
                }
                break;
            }
        }
    }

    // Minions vs player
    for (let m of minions) {
        if (!m.alive) continue;
        if (rectsOverlap(m, player)) {
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
                if (lives <= 0) {
                    endGame();
                    break;
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
        if (rectsOverlap(bombRect, playerRect)) {
            bombs.splice(i, 1);
            if (player.shield) {
                delete activePowerUps.SHIELD;
                player.shield = false;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#08f', 22);
                audio.playHitShield();
                updatePowerUpUI();
            } else {
                lives--;
                createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#0f0', 25);
                audio.playExplosion();
                triggerShake(10);
                if (lives <= 0) {
                    endGame();
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
        audio.stopBGM();
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
const levelUpScreen = document.getElementById('levelUpScreen');
const finalScore = document.getElementById('finalScore');
const finalHighScore = document.getElementById('finalHighScore');

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
    const muted = audio.toggleMute();
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', muted);
});

document.getElementById('startBtn').addEventListener('click', () => {
    audio.init();
    startGame();
});
document.getElementById('restartBtn').addEventListener('click', startGame);

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (gameState === 'menu' || gameState === 'gameover') {
            audio.init();
            startGame();
        }
    }
});

function startGame() {
    gameState = 'playing';
    score = 0;
    credits = 0;
    lives = 3;
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
    activePowerUps = {};
    wingmen = [];
    ufo = null;
    ufoTimer = 0;
    ufoNextSpawn = 10 + Math.random() * 8;
    boss = null;
    minions = [];
    alienDirection = 1;
    alienSpeed = 30;
    alienMoveTimer = 0;
    alienShootTimer = 0;
    upgrades = { speedBonus: 0, bunkerBonus: 0, comboBonus: 0, fireRateBonus: 0 };

    player.init();
    createAliens();
    createBunkers();
    updateUI();
    updatePowerUpUI();

    startScreen.classList.add('hidden');
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
    alienDirection = 1;
    levelConfig = getLevelConfig(level);
    alienSpeed = levelConfig.speed;
    alienMoveTimer = 0;
    alienShootTimer = 0;

    document.getElementById('levelUpNum').textContent = level;
    levelUpScreen.classList.remove('hidden');

    setTimeout(() => {
        levelUpScreen.classList.add('hidden');
        createAliens();
        createBunkers();
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

function endGame() {
    gameState = 'gameover';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('si_highScore', highScore);
    }
    finalScore.textContent = score;
    finalHighScore.textContent = highScore;
    pauseBtn.classList.remove('visible');
    shopBtn.classList.remove('visible');
    audio.stopBGM();

    const rank = getLeaderboardRank(score);
    if (rank >= 0 && score > 0) {
        document.getElementById('entryRank').textContent = rank + 1;
        document.getElementById('entryScore').textContent = score;
        nameInput.value = 'AAA';
        nameEntryScreen.classList.remove('hidden');
    } else {
        renderLeaderboard();
        leaderboardScreen.classList.remove('hidden');
    }
}

// ===== MAIN LOOP =====
function drawLives() {
    const heartSize = 18;
    const gap = 6;
    const startX = 12;
    const startY = 12;
    for (let i = 0; i < lives; i++) {
        const x = startX + i * (heartSize + gap);
        const y = startY;
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f00';
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
    updateAliens(dt);
    updateMinions(dt);
    updateBombs(dt);
    updateUfo(dt);
    updatePowerUps(dt);
    updateParticles(dt);
    updateCombo(dt);
    updateFloatingTexts(dt);
    checkCollisions();
    updatePowerUpUI();

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
    drawParticles();
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

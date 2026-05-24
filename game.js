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
        if (!this.initialized) return;
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
        if (!this.initialized || this.bgmInterval) return;
        this.bgmInterval = setInterval(() => {
            const freq = this.notes[this.noteIndex % this.notes.length];
            this.noteIndex++;
            this._osc('triangle', freq, 0.2, this.masterVolume * 0.35);
        }, 250);
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
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
    rapidStart: false
};

const SHOP_ITEMS = [
    {
        id: 'extraLife', name: 'Extra Life', desc: '+1 life', cost: 300,
        canBuy: () => lives < 5,
        buy: () => { lives++; }
    },
    {
        id: 'speed', name: 'Faster Ship', desc: '+20% move speed', cost: 250,
        canBuy: () => upgrades.speedBonus < 3,
        buy: () => { upgrades.speedBonus++; }
    },
    {
        id: 'bunker', name: 'Wider Bunkers', desc: '+1 brick row', cost: 200,
        canBuy: () => upgrades.bunkerBonus < 2,
        buy: () => { upgrades.bunkerBonus++; }
    },
    {
        id: 'combo', name: 'Longer Combo', desc: '+0.5s combo window', cost: 150,
        canBuy: () => upgrades.comboBonus < 3,
        buy: () => { upgrades.comboBonus++; }
    },
    {
        id: 'rapidStart', name: 'Rapid Fire Start', desc: 'Start with 5s rapid fire', cost: 150,
        canBuy: () => !upgrades.rapidStart,
        buy: () => { upgrades.rapidStart = true; }
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
    let rows = 4 + upgrades.bunkerBonus;
    const pattern = [
        [1,1,1,1,1,1],
        [1,1,1,1,1,1],
        [1,1,0,0,1,1],
        [1,0,0,0,0,1]
    ];
    // Extra rows from upgrade are solid
    for (let e = 0; e < upgrades.bunkerBonus; e++) {
        pattern.unshift([1,1,1,1,1,1]);
    }
    const bWidth = cols * (BUNKER_BRICK_W + BUNKER_GAP) - BUNKER_GAP;
    const numBunkers = 4;
    const spacing = canvas.width / (numBunkers + 1);
    const y = canvas.height - 56;

    for (let b = 0; b < numBunkers; b++) {
        const bx = spacing * (b + 1) - bWidth / 2;
        for (let r = 0; r < rows; r++) {
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

// ===== STARS =====
const stars = [];
for (let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.1
    });
}

function updateStars() {
    stars.forEach(star => {
        star.y += star.speed * 2.5;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });
}

function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
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
                dx: 0
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

function getBossHp(level) {
    return 5 + (level - 3) * 3;
}

function spawnBoss() {
    const hp = getBossHp(level);
    boss = {
        x: canvas.width / 2 - 70,
        y: 35,
        width: 140,
        height: 70,
        speed: 45 + (level - 3) * 3,
        direction: 1,
        hp: hp,
        maxHp: hp,
        shootTimer: 0,
        shootInterval: Math.max(0.35, 1.4 - (level - 3) * 0.08),
        moveTimer: 0,
        points: 300 + level * 80
    };
}

function updateBoss(dt) {
    if (!boss) return;
    boss.moveTimer += dt;
    if (boss.moveTimer >= 0.4) {
        boss.moveTimer = 0;
        boss.x += boss.direction * boss.speed * 0.4;
        if (boss.x <= 10) { boss.direction = 1; boss.x = 10; }
        if (boss.x + boss.width >= canvas.width - 10) { boss.direction = -1; boss.x = canvas.width - boss.width - 10; }
    }
    boss.shootTimer += dt;
    if (boss.shootTimer >= boss.shootInterval) {
        boss.shootTimer = 0;
        const spread = Math.min(4, 1 + Math.floor((level - 3) / 2));
        for (let s = -spread; s <= spread; s++) {
            bombs.push({
                x: boss.x + boss.width / 2 + s * 18,
                y: boss.y + boss.height,
                width: 5,
                height: 10,
                speed: 160 + Math.random() * 50
            });
        }
    }
    if (boss.y + boss.height >= player.y) {
        lives = 0;
        wavePerfect = false;
        updateUI();
        endGame();
    }
}

function drawBoss() {
    if (!boss) return;
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
    ctx.shadowBlur = 0;
    const barW = w * 0.7;
    const barH = 7;
    const barX = x + w * 0.15;
    const barY = y - 14;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = boss.hp > boss.maxHp * 0.4 ? '#0f0' : '#f00';
    ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
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
            bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 0 });
            bullets.push({ x: cx - 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: -130 });
            bullets.push({ x: cx + 6, y: cy, width: 4, height: 12, speed: 500, color: '#ff0', dx: 130 });
        } else {
            bullets.push({ x: cx, y: cy, width: 4, height: 12, speed: 500, color: '#0ff', dx: 0 });
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
        bullets[i].y -= bullets[i].speed * dt;
        bullets[i].x += (bullets[i].dx || 0) * dt;

        // Check bunker collision (player bullets destroy bunkers)
        for (let brick of bunkers) {
            if (!brick.alive) continue;
            const b = bullets[i];
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

function drawBullets() {
    bullets.forEach(b => {
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
        bombs[i].y += bombs[i].speed * dt;

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

        if (bombs[i] && bombs[i].y > canvas.height) {
            bombs.splice(i, 1);
        }
    }
}

function drawBombs() {
    bombs.forEach(b => {
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
                hitFlash: 0
            });
        }
    }

    // Pick one random alien to be the special power-up carrier
    const aliveIndices = aliens.map((a, i) => i);
    const specialIdx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    aliens[specialIdx].special = true;
    aliens[specialIdx].points += 20; // Bonus points for special alien

    alienSpeed = levelConfig.speed;

    // Apply rapid start upgrade
    if (upgrades.rapidStart) {
        activePowerUps.RAPID_FIRE = 5;
        upgrades.rapidStart = false;
        updatePowerUpUI();
    }
}

function updateAliens(dt) {
    if (boss) {
        updateBoss(dt);
        return;
    }
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
                speed: 150 + Math.random() * 100 + level * 15
            });
        }
    }

    for (let alien of aliveAliens) {
        if (alien.y + alien.height >= player.y) {
            lives = 0;
            wavePerfect = false;
            updateUI();
            endGame();
        }
    }
}

function drawAliens() {
    if (boss) { drawBoss(); return; }
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

        // Special alien marker
        if (a.special && a.hitFlash <= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
    });
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
                    const pts = alien.points * mult;
                    score += pts;
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
                createExplosion(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, '#f0f', 22);
                audio.playBonus();
                triggerShake(4);
                spawnPowerUp(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2);
                ufo = null;
                ufoNextSpawn = 8 + Math.random() * 10;
                updateUI();
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
                    createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#f00', 40);
                    audio.playBonus();
                    spawnFloatingText(boss.x + boss.width/2, boss.y, `BOSS DOWN! +${boss.points}`, '#ff0');
                    boss = null;
                    updateUI();
                    setTimeout(() => { if (gameState === 'playing' && !levelTransitioning) nextLevel(); }, 1000);
                }
                break;
            }
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
    document.getElementById('lives').textContent = lives;
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

function togglePause() {
    if (gameState === 'playing') {
        gameState = 'paused';
        screenShake = 0;
        audio.stopBGM();
        pauseScreen.classList.remove('hidden');
        pauseBtn.classList.remove('visible');
    } else if (gameState === 'paused') {
        gameState = 'playing';
        pauseScreen.classList.add('hidden');
        audio.startBGM();
        lastTime = performance.now();
        gameLoop(lastTime);
        pauseBtn.classList.add('visible');
    }
}

document.getElementById('resumeBtn').addEventListener('click', togglePause);
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
        if (gameState === 'playing' || gameState === 'paused') {
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
    shopScoreEl.textContent = score;
    shopGrid.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const can = item.canBuy();
        const affordable = score >= item.cost;
        const el = document.createElement('div');
        el.className = 'shop-item' + (can && affordable ? ' affordable' : '') + (!can ? ' maxed' : '');
        el.innerHTML = `
            <div class="info">
                <div class="name">${item.name}</div>
                <div class="desc">${item.desc}</div>
            </div>
            <div class="cost">${item.cost}</div>
            <button ${!can || !affordable ? 'disabled' : ''}>${!can ? 'MAXED' : 'BUY'}</button>
        `;
        const btn = el.querySelector('button');
        if (can && affordable) {
            btn.addEventListener('click', () => {
                score -= item.cost;
                item.buy();
                audio.playPowerUp();
                updateUI();
                renderShop();
            });
        }
        shopGrid.appendChild(el);
    });
}

function openShop() {
    shopScreen.classList.remove('hidden');
    renderShop();
    pauseBtn.classList.remove('visible');
}

function closeShop() {
    shopScreen.classList.add('hidden');
    proceedToNextLevel();
}

// ===== SCREENS & FLOW =====
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const levelUpScreen = document.getElementById('levelUpScreen');
const finalScore = document.getElementById('finalScore');
const finalHighScore = document.getElementById('finalHighScore');

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
    alienDirection = 1;
    alienSpeed = 30;
    alienMoveTimer = 0;
    alienShootTimer = 0;
    upgrades = { speedBonus: 0, bunkerBonus: 0, comboBonus: 0, rapidStart: false };

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
    pauseBtn.classList.add('visible');

    audio.startBGM();
    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop(lastTime);
}

function proceedToNextLevel() {
    level++;
    boss = null;
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
        if (gameState === 'playing') {
            levelUpScreen.classList.add('hidden');
            createAliens();
            createBunkers();
            levelTransitioning = false;
            pauseBtn.classList.add('visible');
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
    gameOverScreen.classList.remove('hidden');
    pauseScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    pauseBtn.classList.remove('visible');
    audio.stopBGM();
}

// ===== MAIN LOOP =====
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
    drawUfo();
    drawAliens();
    drawBombs();
    player.draw();
    drawBunkers();
    drawWingmen();
    drawBullets();
    drawPowerUps();
    drawParticles();
    drawFloatingTexts();

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

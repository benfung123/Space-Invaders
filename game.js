const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let gameState = 'menu'; // menu, playing, gameover
let score = 0;
let lives = 3;
let animationId;
let lastTime = 0;

// Responsive canvas sizing
function resizeCanvas() {
    const maxWidth = Math.min(600, window.innerWidth - 20);
    const maxHeight = window.innerWidth <= 768 ? window.innerHeight * 0.5 : window.innerHeight * 0.7;
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

// Starfield background
const stars = [];
for (let i = 0; i < 80; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.1
    });
}

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
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Player
const player = {
    x: 0,
    y: 0,
    width: 40,
    height: 25,
    speed: 300,
    color: '#0f0',
    cooldown: 0,
    maxCooldown: 0.25,

    init() {
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 20;
    },

    update(dt) {
        let moving = false;
        if (keys['ArrowLeft'] || keys['a'] || touchInput.left) {
            this.x -= this.speed * dt;
            moving = true;
        }
        if (keys['ArrowRight'] || keys['d'] || touchInput.right) {
            this.x += this.speed * dt;
            moving = true;
        }

        // Clamp to screen
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

        // Cooldown
        if (this.cooldown > 0) this.cooldown -= dt;

        // Auto-fire on touch hold
        if (touchInput.fire && this.cooldown <= 0) {
            this.shoot();
        }
    },

    shoot() {
        if (this.cooldown > 0) return;
        bullets.push({
            x: this.x + this.width / 2,
            y: this.y,
            width: 4,
            height: 12,
            speed: 500,
            color: '#0ff'
        });
        this.cooldown = this.maxCooldown;
    },

    draw() {
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        // Ship body
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();
        // Engine glow
        ctx.fillStyle = '#0af';
        ctx.fillRect(this.x + this.width / 2 - 3, this.y + this.height, 6, 6);
        ctx.shadowBlur = 0;
    }
};

// Bullets
let bullets = [];

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed * dt;
        if (bullets[i].y < -bullets[i].height) {
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

// Alien bombs
let bombs = [];

function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].y += bombs[i].speed * dt;
        if (bombs[i].y > canvas.height) {
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

// Aliens
let aliens = [];
let alienDirection = 1;
let alienSpeed = 30;
let alienDropDistance = 20;
let alienMoveTimer = 0;
let alienShootTimer = 0;

function createAliens() {
    aliens = [];
    const cols = 8;
    const rows = 5;
    const alienWidth = 30;
    const alienHeight = 20;
    const padding = 15;
    const startX = (canvas.width - (cols * (alienWidth + padding) - padding)) / 2;
    const startY = 50;

    const colors = ['#f00', '#f80', '#ff0', '#0f0', '#0ff'];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            aliens.push({
                x: startX + c * (alienWidth + padding),
                y: startY + r * (alienHeight + padding),
                width: alienWidth,
                height: alienHeight,
                color: colors[r % colors.length],
                points: (rows - r) * 10,
                alive: true
            });
        }
    }
}

function updateAliens(dt) {
    const aliveAliens = aliens.filter(a => a.alive);
    if (aliveAliens.length === 0) {
        // Next wave
        createAliens();
        alienSpeed += 10;
        return;
    }

    // Determine if we need to drop
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

    // Move aliens
    alienMoveTimer += dt;
    const moveInterval = Math.max(0.05, 1 - (aliveAliens.length / 40));

    if (alienMoveTimer >= moveInterval) {
        alienMoveTimer = 0;

        if (shouldDrop) {
            alienDirection *= -1;
            aliveAliens.forEach(a => {
                a.y += alienDropDistance;
            });
        } else {
            aliveAliens.forEach(a => {
                a.x += alienDirection * (alienSpeed * 0.5);
            });
        }
    }

    // Alien shooting
    alienShootTimer += dt;
    const shootInterval = Math.max(0.5, 3 - (40 - aliveAliens.length) * 0.05);
    if (alienShootTimer >= shootInterval) {
        alienShootTimer = 0;
        // Bottom-most aliens in each column can shoot
        const shooters = [];
        for (let c = 0; c < 8; c++) {
            let bottomAlien = null;
            for (let r = 4; r >= 0; r--) {
                const idx = r * 8 + c;
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
                speed: 150 + Math.random() * 100
            });
        }
    }

    // Check if aliens reached player
    for (let alien of aliveAliens) {
        if (alien.y + alien.height >= player.y) {
            lives = 0;
            updateUI();
            endGame();
        }
    }
}

function drawAliens() {
    aliens.forEach(a => {
        if (!a.alive) return;
        ctx.fillStyle = a.color;
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 8;

        // Draw alien shape (simple invader-like)
        const x = a.x, y = a.y, w = a.width, h = a.height;
        ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.3);
        ctx.fillRect(x, y + h * 0.3, w, h * 0.5);
        ctx.fillRect(x + w * 0.15, y + h * 0.8, w * 0.2, h * 0.2);
        ctx.fillRect(x + w * 0.65, y + h * 0.8, w * 0.2, h * 0.2);

        ctx.shadowBlur = 0;
    });
}

// Particles for explosions
let particles = [];

function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 0.5 + Math.random() * 0.5,
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
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
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

// Collision detection
function rectsOverlap(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function checkCollisions() {
    // Player bullets hitting aliens
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const bulletRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
        for (let alien of aliens) {
            if (!alien.alive) continue;
            if (rectsOverlap(bulletRect, alien)) {
                alien.alive = false;
                bullets.splice(i, 1);
                score += alien.points;
                createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color);
                updateUI();
                break;
            }
        }
    }

    // Alien bombs hitting player
    for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        const bombRect = { x: b.x - b.width / 2, y: b.y, width: b.width, height: b.height };
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(bombRect, playerRect)) {
            bombs.splice(i, 1);
            lives--;
            createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#0f0', 25);
            updateUI();
            if (lives <= 0) {
                endGame();
            }
            break;
        }
    }
}

// UI updates
function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
}

// Screens
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

// Also allow keyboard to start
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (gameState === 'menu' || gameState === 'gameover') {
            startGame();
        }
    }
});

function startGame() {
    gameState = 'playing';
    score = 0;
    lives = 3;
    bullets = [];
    bombs = [];
    particles = [];
    alienDirection = 1;
    alienSpeed = 30;
    alienMoveTimer = 0;
    alienShootTimer = 0;

    player.init();
    createAliens();
    updateUI();

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop(lastTime);
}

function endGame() {
    gameState = 'gameover';
    finalScore.textContent = score;
    gameOverScreen.classList.remove('hidden');
}

// Main game loop
function gameLoop(timestamp) {
    if (gameState !== 'playing') return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap dt
    lastTime = timestamp;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update
    updateStars();
    player.update(dt);
    updateBullets(dt);
    updateAliens(dt);
    updateBombs(dt);
    updateParticles(dt);
    checkCollisions();

    // Draw
    drawStars();
    drawAliens();
    drawBombs();
    player.draw();
    drawBullets();
    drawParticles();

    animationId = requestAnimationFrame(gameLoop);
}

// Initial render for background
function renderMenuBackground() {
    if (gameState !== 'menu') return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateStars();
    drawStars();
    requestAnimationFrame(renderMenuBackground);
}
renderMenuBackground();

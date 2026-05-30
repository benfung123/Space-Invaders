import { state, saveShipProgress, checkNewUnlocks } from './state.js';
import { storage } from './storage.js';
import { ctx, updateStars, drawStars, applyShake, decayShake, themeColor } from './renderer.js';
import { canvas } from './dom.js';
import { audio } from './audio.js';
import { player } from './entities/player.js';
import { updateBullets, drawBullets } from './entities/bullet.js';
import { updateBombs, drawBombs } from './entities/bomb.js';
import { updateUfo, drawUfo } from './entities/ufo.js';
import { updateMinions, drawMinions } from './entities/minion.js';
import { drawBunkers, createBunkers } from './entities/bunker.js';
import {
    updatePowerUps, drawPowerUps, updateWeapons, drawWeapons,
    updateWingmen, drawWingmen, updateWeaponTimer,
    applyPowerUp, updatePowerUpUI, updatePassiveHUD
} from './entities/powerup.js';
import {
    updateParticles, drawParticles, drawMeteors, drawEmpOverlay,
    updateSingularities, drawSingularities, updateFloatingTexts, drawFloatingTexts,
    spawnFloatingText
} from './entities/particle.js';
import { updateAliens, drawAliens, createAliens, getLevelConfig } from './entities/alien.js';
import { checkCollisions, setNextLevelFn, setEndGameFn } from './systems/collision.js';
import { updateUI, togglePause } from './systems/screens.js';
import { openShop, closeShop } from './systems/shop.js';
import { getLeaderboardRank } from './systems/leaderboard.js';
import { SHIP_CLASSES, POWERUP_TYPES } from './config.js';
import {
    pauseBtn, shopBtn, startScreen, shipSelectScreen, gameOverScreen,
    levelUpScreen, pauseScreen, shopScreen, nameEntryScreen, leaderboardScreen,
    finalScore, finalHighScore, unlockNotice, nameInput, levelUpNum,
    loopOptions, loopContinueBtn, entryRank, entryScore
} from './dom.js';

function updateCombo(dt) {
    if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) {
            state.comboCount = 0;
            updateUI();
        }
    }
}

export function startGame() {
    const ship = SHIP_CLASSES[state.selectedShipKey];
    state.gameState = 'playing';
    state.score = 0;
    state.credits = 0;
    state.lives = ship.lives;
    state.level = 1;
    state.levelTransitioning = false;
    state.wavePerfect = true;
    state.comboCount = 0;
    state.comboTimer = 0;
    state.screenShake = 0;
    state.bullets = [];
    state.bombs = [];
    state.particles = [];
    state.floatingTexts = [];
    state.powerUps = [];
    state.weapons = [];
    state.activeWeapon = null;
    state.weaponTimer = 0;
    state.activePowerUps = {};
    state.wingmen = [];
    state.eventTriggeredThisLevel = false;
    state.activeEvent = null;
    state.empActive = false;
    state.empTimer = 0;
    state.meteors = [];
    state.singularities = [];
    state.harbingerShotCounter = 0;
    state.ufo = null;
    state.ufoTimer = 0;
    state.ufoNextSpawn = 10 + Math.random() * 8;
    state.boss = null;
    state.minions = [];
    state.alienDirection = 1;
    state.alienSpeed = 30;
    state.alienMoveTimer = 0;
    state.alienShootTimer = 0;
    state.diveBomberTimer = 0;
    state.diveBomberCooldown = 7 + Math.random() * 4;
    if (state.loopCount > 0 && state.carriedUpgrades) {
        state.upgrades = { ...state.carriedUpgrades };
    } else {
        state.upgrades = { speedBonus: 0, bunkerBonus: ship.bunkerBonus, comboBonus: 0, fireRateBonus: 0 };
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
    state.lastTime = performance.now();
    if (state.animationId) cancelAnimationFrame(state.animationId);
    gameLoop(state.lastTime);
}

export function proceedToNextLevel() {
    audio.playLevelUp();
    state.level++;
    state.boss = null;
    state.minions = [];
    state.bullets = [];
    state.bombs = [];
    state.powerUps = [];
    state.floatingTexts = [];
    state.comboCount = 0;
    state.comboTimer = 0;
    state.wavePerfect = true;
    state.screenShake = 0;
    state.alienDirection = 1;
    state.levelConfig = getLevelConfig(state.level);
    state.alienSpeed = state.levelConfig.speed;
    state.alienMoveTimer = 0;
    state.alienShootTimer = 0;
    state.eventTriggeredThisLevel = false;
    state.activeEvent = null;
    state.empActive = false;
    state.empTimer = 0;
    state.meteors = [];
    state.weapons = [];
    state.particles = [];
    state.singularities = [];
    state.ufo = null;
    state.ufoTimer = 0;
    state.activeWeapon = null;
    state.weaponTimer = 0;
    state.wingmen = [];
    state.diveBomberTimer = 0;
    state.harbingerShotCounter = 0;

    levelUpNum.textContent = state.level;
    levelUpScreen.classList.remove('hidden');

    setTimeout(() => {
        levelUpScreen.classList.add('hidden');
        createAliens();
        createBunkers();
        // Re-apply ship starting ability at each new level
        const ship = SHIP_CLASSES[state.selectedShipKey];
        if (ship.startPowerUp) {
            applyPowerUp(ship.startPowerUp);
        }
        state.levelTransitioning = false;
        if (state.gameState === 'playing') {
            pauseBtn.classList.add('visible');
            shopBtn.classList.add('visible');
        }
    }, 1500);

    updateUI();
}

export function nextLevel() {
    if (state.levelTransitioning) return;
    state.levelTransitioning = true;

    // Wave perfect bonus
    if (state.wavePerfect) {
        state.score += 200;
        state.credits += 200;
        spawnFloatingText(canvas.width / 2, canvas.height / 2, 'PERFECT WAVE! +200', '#ff0');
        audio.playBonus();
    }

    // Shop after every 3rd level (boss levels are 3,6,9... shop appears after beating boss)
    if (state.level % 3 === 0) {
        openShop();
        return;
    }

    proceedToNextLevel();
}

export function endGame() {
    state.gameState = 'gameover';
    try {
    const prevBest = state.highScore;
    if (state.score > state.highScore) {
        state.highScore = state.score;
        storage.set('si_highScore', state.highScore);
    }
    // Update per-ship best score
    const prevShipBest = state.shipBestScores[state.selectedShipKey] || 0;
    if (state.score > prevShipBest) {
        state.shipBestScores[state.selectedShipKey] = state.score;
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
    const reachedLoopLevel = state.loopCount > 0 || state.level >= 12;
    if (state.level >= 12 && !state.loopUnlocked) {
        state.loopUnlocked = true;
        storage.set('si_loopUnlocked', 'true');
    }
    if (state.loopCount > 0 && state.loopCount > state.highestLoopReached) {
        state.highestLoopReached = state.loopCount;
        storage.set('si_highestLoop', state.highestLoopReached);
    }
    // Harbinger unlock after completing Loop 2
    if (state.loopCount >= 2 && !state.harbingerUnlocked) {
        state.harbingerUnlocked = true;
        storage.set('si_harbingerUnlocked', 'true');
        if (!state.shipUnlocks.includes('HARBINGER')) {
            state.shipUnlocks.push('HARBINGER');
            saveShipProgress();
        }
    }

    finalScore.textContent = state.score;
    finalHighScore.textContent = state.highScore;
    pauseBtn.classList.remove('visible');
    shopBtn.classList.remove('visible');
    audio.startShopBGM();

    // Show loop options if applicable
    // loopOptions and loopContinueBtn already imported from dom.js
    if (state.loopUnlocked && state.level >= 12) {
        loopOptions.classList.remove('hidden');
        loopContinueBtn.textContent = state.loopCount > 0 ? `🔁 CONTINUE TO LOOP ${state.loopCount + 1}` : '🔁 START LOOP 2';
    } else {
        loopOptions.classList.add('hidden');
    }

    gameOverScreen.classList.remove('hidden');

    const rank = getLeaderboardRank(state.score);
    if (rank >= 0 && state.score > 0) {
        entryRank.textContent = rank + 1;
        entryScore.textContent = state.score;
        nameInput.value = 'AAA';
        // Don't show name entry immediately; let player choose loop option first
    }
    } catch (e) {
        console.error('endGame error:', e);
        gameOverScreen.classList.remove('hidden');
    }
}

export function gameLoop(timestamp) {
    if (state.gameState !== 'playing') return;

    const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05);
    state.lastTime = timestamp;

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

    state.animationId = requestAnimationFrame(gameLoop);
}

export function renderMenuBackground() {
    if (state.gameState !== 'menu') return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateStars();
    drawStars();
    requestAnimationFrame(renderMenuBackground);
}

export function drawLives() {
    const heartSize = 18;
    const gap = 6;
    const startX = 12;
    const startY = 12;
    const heartColor = themeColor('bomb');
    for (let i = 0; i < state.lives; i++) {
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

export function drawShipStatus() {
    const panelX = 10;
    const panelY = canvas.height - 50;
    const lineHeight = 16;
    let y = panelY;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px monospace';

    // Active power-ups
    for (let type in state.activePowerUps) {
        const p = POWERUP_TYPES[type];
        const timeLeft = state.activePowerUps[type];
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
    if (state.upgrades.speedBonus > 0) upgradesList.push({ icon: '⚡', val: state.upgrades.speedBonus });
    if (state.upgrades.fireRateBonus > 0) upgradesList.push({ icon: '🔫', val: state.upgrades.fireRateBonus });
    if (state.upgrades.bunkerBonus > 0) upgradesList.push({ icon: '🛡', val: state.upgrades.bunkerBonus });
    if (state.upgrades.comboBonus > 0) upgradesList.push({ icon: '✦', val: state.upgrades.comboBonus });

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

// Wire up forward references for modules that need them
import { setNextLevelFn as setAlienNextLevel, setEndGameFn as setAlienEndGame } from './entities/alien.js';
import { setNextLevelFn as setBossNextLevel, setEndGameFn as setBossEndGame } from './entities/boss.js';
import { setGameFlowFns } from './systems/screens.js';
import { setShopFlowFns } from './systems/shop.js';

setNextLevelFn(nextLevel);
setEndGameFn(endGame);
setAlienNextLevel(nextLevel);
setAlienEndGame(endGame);
setBossNextLevel(nextLevel);
setBossEndGame(endGame);
setGameFlowFns(gameLoop, proceedToNextLevel);
setShopFlowFns(proceedToNextLevel, gameLoop);

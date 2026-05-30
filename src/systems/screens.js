import { state } from '../state.js';
import { storage } from '../storage.js';
import { THEMES, SHIP_CLASSES, COMBO_MAX } from '../config.js';
import { canvas } from '../dom.js';
import { applyTheme, themeColor } from '../renderer.js';
import { audio } from '../audio.js';
import { showShipSelect as showShipSelectFn, renderShipSelect as renderShipSelectFn } from './shipSelect.js';
import { renderShop, openShop, closeShop } from './shop.js';
import { renderLeaderboard } from './leaderboard.js';
import { updatePowerUpUI, updatePassiveHUD } from '../entities/powerup.js';
import { getUnlockedShips, checkNewUnlocks } from '../state.js';

import {
    startScreen, gameOverScreen, shipSelectScreen, levelUpScreen,
    pauseScreen, shopScreen, nameEntryScreen, leaderboardScreen,
    finalScore, finalHighScore, unlockNotice, muteBtn,
    pauseBtn, shopBtn
} from '../dom.js';

export function updateUI() {
    document.getElementById('score').textContent = state.score;
    document.getElementById('credits').textContent = state.credits;
    document.getElementById('level').textContent = state.level;
    document.getElementById('highScore').textContent = state.highScore;

    const comboEl = document.getElementById('combo');
    const comboBox = document.getElementById('comboBox');
    comboEl.textContent = state.comboCount;
    comboBox.classList.remove('active', 'hot');
    if (state.comboCount >= 4) {
        comboBox.classList.add('hot');
    } else if (state.comboCount >= 2) {
        comboBox.classList.add('active');
    }
}

let gameLoopFn = () => {};
let proceedToNextLevelFn = () => {};

export function setGameFlowFns(gameLoop, proceedToNextLevel) {
    gameLoopFn = gameLoop;
    proceedToNextLevelFn = proceedToNextLevel;
}

export function togglePause() {
    if (state.gameState === 'playing') {
        state.gameState = 'paused';
        state.screenShake = 0;
        audio.stopBGM();
        pauseScreen.classList.remove('hidden');
        shopBtn.classList.remove('visible');
    } else if (state.gameState === 'paused') {
        state.gameState = 'playing';
        pauseScreen.classList.add('hidden');
        audio.startBGM();
        state.lastTime = performance.now();
        gameLoopFn(state.lastTime);
        pauseBtn.classList.add('visible');
        shopBtn.classList.add('visible');
    }
}

export function renderThemeSwatches() {
    const container = document.getElementById('themeSwatches');
    if (!container) return;
    container.innerHTML = '';
    for (const key in THEMES) {
        const t = THEMES[key];
        const swatch = document.createElement('div');
        swatch.className = 'theme-swatch' + (key === state.currentTheme ? ' active' : '');
        swatch.style.backgroundColor = t.ui;
        swatch.title = t.name;
        swatch.addEventListener('click', () => {
            applyTheme(key);
            renderThemeSwatches();
        });
        container.appendChild(swatch);
    }
}

export function renderMenuInfo() {
    const loopRecord = document.getElementById('loopRecord');
    if (loopRecord) {
        if (state.highestLoopReached > 0) {
            loopRecord.textContent = `🔁 Loop Record: ${state.highestLoopReached}`;
            loopRecord.classList.remove('hidden');
        } else {
            loopRecord.classList.add('hidden');
        }
    }
}

export function showShipSelect() {
    getUnlockedShips();
    renderShipSelectFn();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    shipSelectScreen.classList.remove('hidden');
}

export function initScreens() {
    function toggleMute() {
        const muted = audio.toggleMute();
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('muted', muted);
        const pauseMuteBtn = document.getElementById('pauseMuteBtn');
        if (pauseMuteBtn) {
            pauseMuteBtn.textContent = muted ? '🔇' : '🔊';
            pauseMuteBtn.classList.toggle('muted', muted);
        }
    }
    muteBtn.addEventListener('click', toggleMute);
    document.getElementById('pauseMuteBtn')?.addEventListener('click', toggleMute);

    document.getElementById('startBtn').addEventListener('click', () => {
        audio.init();
        renderMenuInfo();
        showShipSelect();
    });

    document.getElementById('restartBtn').addEventListener('click', showShipSelect);

    document.getElementById('shipBackBtn').addEventListener('click', () => {
        shipSelectScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    });

    document.getElementById('launchBtn').addEventListener('click', () => {
        shipSelectScreen.classList.add('hidden');
        // startGame called from game.js
    });

    document.getElementById('resumeBtn').addEventListener('click', togglePause);

    document.getElementById('pauseShopBtn').addEventListener('click', () => {
        pauseScreen.classList.add('hidden');
        openShop(true);
    });

    shopBtn.addEventListener('click', () => {
        if (state.gameState === 'playing') {
            openShop(false, true);
        }
    });

    document.getElementById('quitBtn').addEventListener('click', () => {
        togglePause();
        state.gameState = 'menu';
        pauseScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
        audio.stopBGM();
    });

    document.getElementById('shopContinueBtn').addEventListener('click', closeShop);

    pauseBtn.addEventListener('click', togglePause);

    document.getElementById('lbBtnStart').addEventListener('click', () => {
        renderLeaderboard();
        leaderboardScreen.classList.remove('hidden');
    });

    document.getElementById('lbPlayBtn').addEventListener('click', () => {
        leaderboardScreen.classList.add('hidden');
        // startGame called from game.js
    });

    document.getElementById('lbMenuBtn').addEventListener('click', () => {
        leaderboardScreen.classList.add('hidden');
        state.gameState = 'menu';
        startScreen.classList.remove('hidden');
        renderMenuBackground();
    });

    document.getElementById('loopContinueBtn').addEventListener('click', () => {
        state.loopCount++;
        state.carriedUpgrades = { ...state.upgrades };
        // startGame called from game.js
    });

    document.getElementById('loopResetBtn').addEventListener('click', () => {
        state.loopCount = 0;
        state.carriedUpgrades = null;
        showShipSelect();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
            if (state.gameState === 'shop') {
                closeShop();
            } else if (state.gameState === 'playing' || state.gameState === 'paused') {
                togglePause();
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (state.gameState === 'menu') {
                audio.init();
                showShipSelect();
            } else if (state.gameState === 'gameover') {
                audio.init();
                showShipSelect();
            }
        }
    });

    applyTheme(state.currentTheme);
    renderThemeSwatches();
    renderMenuInfo();
    document.getElementById('highScore').textContent = state.highScore;
}

// Forward declarations — patched by game.js
let startGameFn = () => {};
let renderMenuBackgroundFn = () => {};

export function setGameFns(start, menuBg) {
    startGameFn = start;
    renderMenuBackgroundFn = menuBg;
    // Wire up launch/start buttons now that game fn is available
    document.getElementById('launchBtn').onclick = () => {
        shipSelectScreen.classList.add('hidden');
        startGameFn();
    };
    document.getElementById('restartBtn').onclick = () => {
        audio.init();
        showShipSelect();
    };
    document.getElementById('lbPlayBtn').onclick = () => {
        leaderboardScreen.classList.add('hidden');
        startGameFn();
    };
}

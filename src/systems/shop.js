import { state } from '../state.js';
import { audio } from '../audio.js';
import { shopScreen, shopGrid, shopScoreEl, pauseScreen, pauseBtn, shopBtn } from '../dom.js';
import { createBunkers } from '../entities/bunker.js';
import { getFireRateCooldown } from '../entities/player.js';

export function scaleCost(base) {
    return Math.floor(base * (1 + (state.level - 1) * 0.25));
}

export const SHOP_ITEMS = [
    {
        id: 'extraLife', name: 'Extra Life', desc: '+1 life (max 5)',
        getCost: () => scaleCost([500, 900, 1500, 2200, 3000][state.lives] || 9999),
        canBuy: () => state.lives < 5,
        buy: () => { state.lives++; updateUI(); }
    },
    {
        id: 'speed', name: 'Faster Ship', desc: '+20% move speed (max Lv10)',
        getCost: () => scaleCost([400, 700, 1100, 1600, 2200, 2900, 3700, 4600, 5600, 6800][state.upgrades.speedBonus] || 9999),
        canBuy: () => state.upgrades.speedBonus < 10,
        buy: () => { state.upgrades.speedBonus++; state.player.speed = 300 * (1 + state.upgrades.speedBonus * 0.2); }
    },
    {
        id: 'bunker', name: 'Wider Bunkers', desc: '+1 brick row per bunker (max Lv10)',
        getCost: () => scaleCost([350, 600, 950, 1400, 1900, 2500, 3200, 4000, 4900, 5900][state.upgrades.bunkerBonus] || 9999),
        canBuy: () => state.upgrades.bunkerBonus < 10,
        buy: () => { state.upgrades.bunkerBonus++; createBunkers(); }
    },
    {
        id: 'combo', name: 'Longer Combo', desc: '+0.5s combo window (max Lv10)',
        getCost: () => scaleCost([300, 550, 850, 1200, 1600, 2100, 2700, 3400, 4200, 5100][state.upgrades.comboBonus] || 9999),
        canBuy: () => state.upgrades.comboBonus < 10,
        buy: () => { state.upgrades.comboBonus++; }
    },
    {
        id: 'fireRate', name: 'Quick Trigger', desc: 'Permanent fire rate up (max Lv10)',
        getCost: () => scaleCost([400, 750, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800][state.upgrades.fireRateBonus] || 9999),
        canBuy: () => state.upgrades.fireRateBonus < 10,
        buy: () => { state.upgrades.fireRateBonus++; state.player.baseCooldown = getFireRateCooldown(); }
    }
];

let shopFromPause = false;
let shopFromDirect = false;

let proceedToNextLevelFn = () => {};
let gameLoopFn = () => {};

export function setShopFlowFns(proceedToNextLevel, gameLoop) {
    proceedToNextLevelFn = proceedToNextLevel;
    gameLoopFn = gameLoop;
}

export function renderShop() {
    shopScoreEl.textContent = state.credits;
    shopGrid.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const cost = item.getCost();
        const can = item.canBuy();
        const affordable = state.credits >= cost;
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
                state.credits -= cost;
                item.buy();
                audio.playPowerUp();
                updateUI();
                renderShop();
            });
        }
        shopGrid.appendChild(el);
    });
}

export function openShop(fromPause = false, fromDirect = false) {
    shopFromPause = fromPause;
    shopFromDirect = fromDirect;
    shopScreen.classList.remove('hidden');
    renderShop();
    pauseBtn.classList.remove('visible');
    shopBtn.classList.remove('visible');
    if (state.gameState === 'playing') {
        state.gameState = 'shop';
        audio.startShopBGM();
    }
}

export function closeShop() {
    shopScreen.classList.add('hidden');
    if (shopFromPause) {
        state.gameState = 'paused';
        pauseScreen.classList.remove('hidden');
    } else if (shopFromDirect) {
        state.gameState = 'playing';
        state.lastTime = performance.now();
        gameLoopFn(state.lastTime);
        audio.startBGM();
        pauseBtn.classList.add('visible');
        shopBtn.classList.add('visible');
    } else {
        state.gameState = 'playing';
        proceedToNextLevelFn();
    }
}

// Forward declaration to avoid circular imports during load
function updateUI() {
    // Will be patched by screens.js init
}

export function setUpdateUIFn(fn) {
    updateUI = fn;
}

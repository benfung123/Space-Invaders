import { state, getUnlockedShips } from '../state.js';
import { SHIP_CLASSES } from '../config.js';
import { shipSelectScreen } from '../dom.js';

export function showShipSelect() {
    getUnlockedShips();
    renderShipSelect();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    shipSelectScreen.classList.remove('hidden');
}

export function renderShipSelect() {
    const grid = document.getElementById('shipGrid');
    const stats = document.getElementById('shipStats');
    grid.innerHTML = '';
    getUnlockedShips();

    for (const key in SHIP_CLASSES) {
        const ship = SHIP_CLASSES[key];
        const unlocked = state.shipUnlocks.includes(key);
        const el = document.createElement('div');
        el.className = 'ship-card' + (unlocked ? ' unlocked' : '') + (key === state.selectedShipKey ? ' selected' : '');
        el.innerHTML = `
            <div class="icon">${unlocked ? ship.icon : '🔒'}</div>
            <div class="name">${ship.name}</div>
            ${unlocked ? '' : `<div class="lock">${ship.unlockScore} pts</div>`}
        `;
        if (unlocked) {
            el.addEventListener('click', () => {
                state.selectedShipKey = key;
                renderShipSelect();
            });
        }
        grid.appendChild(el);
    }

    const sel = SHIP_CLASSES[state.selectedShipKey];
    const best = state.shipBestScores[state.selectedShipKey] || 0;
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

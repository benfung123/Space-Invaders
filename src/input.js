import { state } from './state.js';
import { leftBtn, rightBtn, fireBtn, mobileControls, canvas } from './dom.js';
import { audio } from './audio.js';
import { createExplosion } from './entities/particle.js';

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function initInput(player) {
    if (isTouchDevice() && mobileControls) {
        mobileControls.style.display = 'flex';
        const desktopHint = document.getElementById('desktopHint');
        const touchHint = document.getElementById('touchHint');
        if (desktopHint) desktopHint.classList.add('hidden');
        if (touchHint) touchHint.classList.remove('hidden');
    }
    window.addEventListener('keydown', (e) => {
        state.keys[e.key] = true;
        if (e.key === ' ' && state.gameState === 'playing') {
            e.preventDefault();
            player.shoot();
        }
        // Spectre: Phase Shift double-tap
        if (state.gameState === 'playing' && state.selectedShipKey === 'SPECTRE' && state.phaseShiftCooldown <= 0) {
            const now = performance.now();
            const dir = e.key === 'ArrowLeft' || e.key === 'a' ? 'left' : e.key === 'ArrowRight' || e.key === 'd' ? 'right' : null;
            if (dir) {
                if (state.lastKeyTapTime[dir] && now - state.lastKeyTapTime[dir] < 300) {
                    const dx = dir === 'left' ? -60 : 60;
                    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + dx));
                    state.phaseShiftCooldown = 5;
                    state.phaseShiftTimer = 0.3;
                    createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#ff0', 8);
                    audio.playBonus();
                } else {
                    state.lastKeyTapTime[dir] = now;
                    state.lastKeyTapTime[dir === 'left' ? 'right' : 'left'] = 0;
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        state.keys[e.key] = false;
    });

    function setupTouchBtn(btn, key) {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            state.touchInput[key] = true;
            if (state.gameState === 'playing' && state.selectedShipKey === 'SPECTRE' && state.phaseShiftCooldown <= 0 && (key === 'left' || key === 'right')) {
                const now = performance.now();
                if (state.lastKeyTapTime[key] && now - state.lastKeyTapTime[key] < 300) {
                    const dx = key === 'left' ? -60 : 60;
                    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + dx));
                    state.phaseShiftCooldown = 5;
                    state.phaseShiftTimer = 0.3;
                    createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#ff0', 8);
                    audio.playBonus();
                } else {
                    state.lastKeyTapTime[key] = now;
                    state.lastKeyTapTime[key === 'left' ? 'right' : 'left'] = 0;
                }
            }
        }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); state.touchInput[key] = false; });
        btn.addEventListener('touchcancel', (e) => { state.touchInput[key] = false; });
        btn.addEventListener('mousedown', (e) => { state.touchInput[key] = true; });
        btn.addEventListener('mouseup', (e) => { state.touchInput[key] = false; });
        btn.addEventListener('mouseleave', (e) => { state.touchInput[key] = false; });
    }

    setupTouchBtn(leftBtn, 'left');
    setupTouchBtn(rightBtn, 'right');
    setupTouchBtn(fireBtn, 'fire');

    window.addEventListener('blur', resetInput);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetInput();
    });
}

export function resetInput() {
    for (let k in state.keys) state.keys[k] = false;
    state.touchInput.left = false;
    state.touchInput.right = false;
    state.touchInput.fire = false;
}

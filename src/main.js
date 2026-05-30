import { resizeCanvas, initStars, applyTheme } from './renderer.js';
import { state } from './state.js';
import { initInput } from './input.js';
import { initScreens, setGameFns } from './systems/screens.js';
import { initLeaderboard } from './systems/leaderboard.js';
import { startGame, renderMenuBackground } from './game.js';
import { audio } from './audio.js';
import { setUpdateUIFn } from './systems/shop.js';
import { updateUI } from './systems/screens.js';
import { player } from './entities/player.js';

// Wire up shop UI callback
setUpdateUIFn(updateUI);

// Wire up screen navigation callbacks
setGameFns(startGame, renderMenuBackground);

// Init
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
initStars();
initInput(player);
initScreens();
initLeaderboard();
applyTheme(state.currentTheme);

// iOS Safari: resume AudioContext on first user interaction
function resumeAudioContext() {
    if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
    }
}
window.addEventListener('pointerdown', resumeAudioContext, { once: true });
window.addEventListener('touchstart', resumeAudioContext, { once: true });

// Start menu background loop
renderMenuBackground();

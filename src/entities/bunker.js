import { state } from '../state.js';
import { ctx, themeColor } from '../renderer.js';
import { BUNKER_BRICK_W, BUNKER_BRICK_H, BUNKER_GAP } from '../config.js';
import { canvas } from '../dom.js';

export function createBunkers() {
    state.bunkers = [];
    const cols = 6;
    const pattern = [
        [1,1,1,1,1,1],
        [1,1,1,1,1,1],
        [1,1,0,0,1,1],
        [1,0,0,0,0,1]
    ];
    for (let e = 0; e < state.upgrades.bunkerBonus; e++) {
        pattern.unshift([1,1,1,1,1,1]);
    }
    const bWidth = cols * (BUNKER_BRICK_W + BUNKER_GAP) - BUNKER_GAP;
    const numBunkers = 4;
    const spacing = canvas.width / (numBunkers + 1);
    const y = canvas.height - 85 - state.upgrades.bunkerBonus * (BUNKER_BRICK_H + BUNKER_GAP);

    for (let b = 0; b < numBunkers; b++) {
        const bx = spacing * (b + 1) - bWidth / 2;
        for (let r = 0; r < pattern.length; r++) {
            for (let c = 0; c < cols; c++) {
                if (pattern[r][c]) {
                    state.bunkers.push({
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

export function drawBunkers() {
    ctx.fillStyle = themeColor('bunker');
    ctx.shadowColor = themeColor('bunkerGlow');
    ctx.shadowBlur = 4;
    state.bunkers.forEach(b => {
        if (!b.alive) return;
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });
    ctx.shadowBlur = 0;
}

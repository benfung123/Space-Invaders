import { state } from '../state.js';
import { ctx, canvas, drawSprite, SPRITES } from '../renderer.js';
import { audio } from '../audio.js';

export function spawnUfo() {
    const direction = Math.random() < 0.5 ? -1 : 1;
    const startX = direction === 1 ? -60 : canvas.width + 60;
    state.ufo = {
        x: startX, y: 28,
        width: 48, height: 22,
        speed: 80 + state.level * 12,
        direction: direction,
        points: 50 + Math.floor(Math.random() * 50)
    };
    audio.playUfo();
}

export function updateUfo(dt) {
    state.ufoTimer += dt;
    if (!state.ufo && state.ufoTimer >= state.ufoNextSpawn) {
        spawnUfo();
        state.ufoTimer = 0;
    }
    if (state.ufo) {
        state.ufo.x += state.ufo.speed * state.ufo.direction * dt;
        if ((state.ufo.direction === 1 && state.ufo.x > canvas.width + 70) ||
            (state.ufo.direction === -1 && state.ufo.x < -70)) {
            state.ufo = null;
            state.ufoNextSpawn = 8 + Math.random() * 12;
        }
    }
}

export function drawUfo() {
    if (!state.ufo) return;
    const x = state.ufo.x, y = state.ufo.y, w = state.ufo.width, h = state.ufo.height;
    if (SPRITES.ufo && SPRITES.ufo.complete && SPRITES.ufo.naturalWidth > 0) {
        drawSprite(SPRITES.ufo, x, y, w, h);
    } else {
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
}

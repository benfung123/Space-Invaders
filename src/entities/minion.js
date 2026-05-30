import { state } from '../state.js';
import { ctx, canvas, themeColor, drawSprite, SPRITES } from '../renderer.js';
import { player } from './player.js';

export function spawnMinion(x, y) {
    state.minions.push({
        x: x, y: y,
        width: 20, height: 15,
        speed: 140 + state.level * 10,
        color: '#0f0',
        hp: 1,
        alive: true,
        points: 15
    });
}

export function updateMinions(dt) {
    for (let i = state.minions.length - 1; i >= 0; i--) {
        const m = state.minions[i];
        if (!m.alive) { state.minions.splice(i, 1); continue; }
        m.y += m.speed * dt;
        m.x += (player.x - m.x) * 1.2 * dt;
        if (m.y > canvas.height + 20) {
            m.alive = false;
        }
    }
}

export function drawMinions() {
    const minionColor = themeColor('minion');
    state.minions.forEach(m => {
        if (!m.alive) return;
        if (SPRITES.minion && SPRITES.minion.complete && SPRITES.minion.naturalWidth > 0) {
            drawSprite(SPRITES.minion, m.x, m.y, m.width, m.height);
        } else {
            ctx.fillStyle = minionColor;
            ctx.shadowColor = minionColor;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(m.x + m.width / 2, m.y + m.height);
            ctx.lineTo(m.x + m.width, m.y);
            ctx.lineTo(m.x, m.y);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    });
}

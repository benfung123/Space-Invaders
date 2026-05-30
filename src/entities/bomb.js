import { state } from '../state.js';
import { ctx, canvas, themeColor } from '../renderer.js';
import { createExplosion } from './particle.js';

export function updateBombs(dt) {
    for (let i = state.bombs.length - 1; i >= 0; i--) {
        const b = state.bombs[i];
        b.y += (b.speed + (b.dy || 0)) * dt;
        b.x += (b.dx || 0) * dt;

        for (let brick of state.bunkers) {
            if (!brick.alive) continue;
            const bomb = state.bombs[i];
            if (bomb.x - bomb.width/2 < brick.x + brick.width && bomb.x + bomb.width/2 > brick.x &&
                bomb.y < brick.y + brick.height && bomb.y + bomb.height > brick.y) {
                brick.alive = false;
                createExplosion(brick.x + brick.width/2, brick.y + brick.height/2, '#0a0', 5);
                state.bombs.splice(i, 1);
                break;
            }
        }

        if (state.bombs[i] && (state.bombs[i].y > canvas.height || state.bombs[i].x < -50 || state.bombs[i].x > canvas.width + 50)) {
            state.bombs.splice(i, 1);
        }
    }
}

export function drawBombs() {
    const bombColor = themeColor('bomb');
    state.bombs.forEach(b => {
        // Note: bomb trail not stored in original, but drawTrail helper available
        ctx.fillStyle = bombColor;
        ctx.shadowColor = bombColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x - b.width / 2, b.y, b.width, b.height);
        ctx.shadowBlur = 0;
    });
}

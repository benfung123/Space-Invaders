import { state } from '../state.js';
import { ctx, canvas } from '../renderer.js';
import { createExplosion } from './particle.js';
import { triggerShake } from '../renderer.js';

export function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();

        if (b.type === 'HOMING') {
            let nearest = null;
            let nearestDist = Infinity;
            for (let alien of state.aliens) {
                if (!alien.alive) continue;
                const d = Math.hypot(alien.x + alien.width/2 - b.x, alien.y + alien.height/2 - b.y);
                if (d < nearestDist) { nearestDist = d; nearest = alien; }
            }
            if (state.boss) {
                const d = Math.hypot(state.boss.x + state.boss.width/2 - b.x, state.boss.y + state.boss.height/2 - b.y);
                if (d < nearestDist) { nearestDist = d; nearest = state.boss; }
            }
            if (nearest) {
                const tx = nearest.x + (nearest.width || 0) / 2;
                const turn = (tx - b.x) * 3;
                b.dx = (b.dx || 0) + (turn - (b.dx || 0)) * 5 * dt;
                b.dx = Math.max(-200, Math.min(200, b.dx));
            }
        }

        b.y -= b.speed * dt;
        b.x += (b.dx || 0) * dt;

        if (b.type !== 'PIERCE') {
            for (let brick of state.bunkers) {
                if (!brick.alive) continue;
                if (b.x - b.width/2 < brick.x + brick.width && b.x + b.width/2 > brick.x &&
                    b.y < brick.y + brick.height && b.y + b.height > brick.y) {
                    brick.alive = false;
                    createExplosion(brick.x + brick.width/2, brick.y + brick.height/2, '#0a0', 5);
                    triggerShake(1);
                    state.bullets.splice(i, 1);
                    break;
                }
            }
        }

        if (state.bullets[i] && (state.bullets[i].y < -state.bullets[i].height || state.bullets[i].x < -50 || state.bullets[i].x > canvas.width + 50)) {
            state.bullets.splice(i, 1);
        }
    }
}

export function drawTrail(trail, color, width) {
    if (trail.length < 2) return;
    for (let i = 0; i < trail.length - 1; i++) {
        const alpha = (i / trail.length) * 0.35;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(trail[i].x - width/2, trail[i].y, width, 3);
    }
    ctx.globalAlpha = 1;
}

export function drawBullets() {
    state.bullets.forEach(b => {
        drawTrail(b.trail, b.color, b.width * 1.5);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x - b.width / 2, b.y, b.width, b.height);
        ctx.shadowBlur = 0;
    });
}

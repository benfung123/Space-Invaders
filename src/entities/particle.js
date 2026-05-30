import { state } from '../state.js';
import { ctx, canvas } from '../renderer.js';
import { audio } from '../audio.js';
import { themeColor } from '../renderer.js';

export function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 280,
            vy: (Math.random() - 0.5) * 280,
            life: 0.4 + Math.random() * 0.5,
            color: color,
            size: Math.random() * 3 + 1
        });
    }
}

export function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

export function drawParticles() {
    state.particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

export function spawnFloatingText(x, y, text, color = '#fff') {
    state.floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 0.9,
        maxLife: 0.9,
        vy: -50
    });
}

export function updateFloatingTexts(dt) {
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.life -= dt;
        if (ft.life <= 0) {
            state.floatingTexts.splice(i, 1);
        }
    }
}

export function drawFloatingTexts() {
    state.floatingTexts.forEach(ft => {
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

export function drawMeteors() {
    state.meteors.forEach(m => {
        if (!m.alive) return;
        ctx.fillStyle = '#888';
        ctx.shadowColor = '#aaa';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(m.x + m.size / 2, m.y + m.size / 2, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(m.x + m.size * 0.3, m.y + m.size * 0.35, m.size * 0.15, 0, Math.PI * 2);
        ctx.fill();
    });
}

export function drawEmpOverlay() {
    if (!state.empActive) return;
    const alpha = 0.04 + Math.sin(Date.now() / 100) * 0.03;
    ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function updateSingularities(dt) {
    const eventHorizon = state.selectedShipKey === 'HARBINGER';
    for (let i = state.singularities.length - 1; i >= 0; i--) {
        const s = state.singularities[i];
        s.timer -= dt;
        s.y -= 60 * dt;
        for (let alien of state.aliens) {
            if (!alien.alive) continue;
            const ax = alien.x + alien.width / 2;
            const ay = alien.y + alien.height / 2;
            const dist = Math.hypot(ax - s.x, ay - s.y);
            if (dist < s.radius && dist > 5) {
                const pull = s.pullForce * dt * (1 - dist / s.radius);
                alien.x += (s.x - ax) * pull / dist;
                alien.y += (s.y - ay) * pull / dist;
            }
            if (eventHorizon && dist < s.radius * 0.5) {
                alien.hp -= dt;
                alien.hitFlash = 0.1;
                if (alien.hp <= 0) {
                    alien.alive = false;
                    // Damage application handled in collision module
                }
            }
        }
        if (eventHorizon) {
            for (let bomb of state.bombs) {
                const dist = Math.hypot(bomb.x - s.x, bomb.y - s.y);
                if (dist < s.radius && dist > 5) {
                    const pull = s.pullForce * 0.5 * dt * (1 - dist / s.radius);
                    bomb.x += (s.x - bomb.x) * pull / dist;
                    bomb.y += (s.y - bomb.y) * pull / dist;
                }
            }
        }
        if (s.timer <= 0 || s.y < -50) {
            state.singularities.splice(i, 1);
        }
    }
}

export function drawSingularities() {
    state.singularities.forEach(s => {
        const pulse = 0.3 + Math.sin(Date.now() / 60) * 0.2;
        ctx.fillStyle = `rgba(160, 0, 255, ${pulse})`;
        ctx.shadowColor = '#a0f';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(200, 100, 255, ${pulse + 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    });
}

import { state } from '../state.js';
import { storage } from '../storage.js';
import { lbTable, nameEntryScreen, leaderboardScreen, nameInput, entryRank, entryScore } from '../dom.js';

export function getLeaderboardRank(score) {
    for (let i = 0; i < state.leaderboard.length; i++) {
        if (score > state.leaderboard[i].score) return i;
    }
    return state.leaderboard.length < 5 ? state.leaderboard.length : -1;
}

export function saveLeaderboard(name, score) {
    const entry = {
        name: name.toUpperCase().substring(0, 3) || 'AAA',
        score: score,
        level: state.level,
        date: new Date().toLocaleDateString()
    };
    state.leaderboard.push(entry);
    state.leaderboard.sort((a, b) => b.score - a.score);
    state.leaderboard = state.leaderboard.slice(0, 5);
    storage.setJson('si_leaderboard', state.leaderboard);
    return state.leaderboard.findIndex(e => e === entry);
}

export function renderLeaderboard(highlightIndex = -1) {
    lbTable.innerHTML = '';
    if (state.leaderboard.length === 0) {
        lbTable.innerHTML = '<div class="lb-row"><span style="color:#888">No scores yet. Be the first!</span></div>';
        return;
    }
    state.leaderboard.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (i === highlightIndex ? ' highlight' : '');
        row.innerHTML = `
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-name">${entry.name}</span>
            <span class="lb-score">${entry.score}</span>
        `;
        lbTable.appendChild(row);
    });
}

export function initLeaderboard() {
    document.getElementById('nameSubmitBtn').addEventListener('click', () => {
        const name = nameInput.value;
        const scoreVal = parseInt(entryScore.textContent);
        const highlightIdx = saveLeaderboard(name, scoreVal);
        nameEntryScreen.classList.add('hidden');
        renderLeaderboard(highlightIdx);
        leaderboardScreen.classList.remove('hidden');
    });
}

import { state } from './state.js';

export class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.bgmInterval = null;
        this.noteIndex = 0;
        this.notes = [110, 110, 130, 110, 98, 98, 110, 98];
        this.masterVolume = 0.1;
        this.muted = false;

        this.bgmNormal = new Audio('Gravity_Well.mp3');
        this.bgmBoss = new Audio('Hull_Breach_Protocol.mp3');
        this.bgmShop = new Audio('Gravity_Well_Escape.mp3');
        this.bgmNormal.loop = true;
        this.bgmBoss.loop = true;
        this.bgmShop.loop = true;
        this.bgmNormal.volume = 0.35;
        this.bgmBoss.volume = 0.35;
        this.bgmShop.volume = 0.35;
        this.bgmNormal.preload = 'auto';
        this.bgmBoss.preload = 'auto';
        this.bgmShop.preload = 'auto';
        this.currentTrack = null;
    }

    toggleMute() {
        this.muted = !this.muted;
        this.bgmNormal.muted = this.muted;
        this.bgmBoss.muted = this.muted;
        this.bgmShop.muted = this.muted;
        if (this.muted) {
            this.stopBGM();
        } else if (state.gameState === 'playing' || state.gameState === 'shop') {
            this.startBGM();
        }
        return this.muted;
    }

    init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
        [this.bgmNormal, this.bgmBoss, this.bgmShop].forEach(track => {
            track.play().then(() => track.pause()).catch(() => {});
        });
    }

    _osc(type, freq, duration, vol, freqEnd = null) {
        if (!this.initialized || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (freqEnd !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playShoot() { this._osc('square', 880, 0.1, this.masterVolume, 440); }
    playExplosion() { this._osc('sawtooth', 200, 0.25, this.masterVolume * 1.2, 40); }
    playUfo() { this._osc('sine', 500, 0.6, this.masterVolume * 0.6, 700); }
    playHitShield() { this._osc('square', 350, 0.3, this.masterVolume, 80); }

    playPowerUp() {
        if (!this.initialized) return;
        [523, 659, 784].forEach((freq, i) => {
            setTimeout(() => this._osc('square', freq, 0.15, this.masterVolume, freq * 0.5), i * 70);
        });
    }

    playBonus() {
        if (!this.initialized) return;
        [784, 880, 1047, 1319].forEach((freq, i) => {
            setTimeout(() => this._osc('square', freq, 0.12, this.masterVolume, freq * 0.5), i * 60);
        });
    }

    playLevelUp() {
        if (!this.initialized || this.muted) return;
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._osc('square', freq, 0.18, this.masterVolume, freq * 0.5);
                this._osc('triangle', freq * 2, 0.15, this.masterVolume * 0.5, freq * 2);
            }, i * 90);
        });
    }

    startShopBGM() {
        if (this.muted) return;
        this.stopBGM();
        const track = this.bgmShop;
        track.currentTime = 0;
        const playPromise = track.play();
        if (playPromise) playPromise.catch(() => {});
        this.currentTrack = track;
    }

    startBGM() {
        if (this.muted) return;
        this.stopBGM();
        const track = state.boss ? this.bgmBoss : this.bgmNormal;
        track.currentTime = 0;
        const playPromise = track.play();
        if (playPromise) playPromise.catch(() => {});
        this.currentTrack = track;
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
        this.bgmNormal.pause();
        this.bgmBoss.pause();
        this.bgmShop.pause();
        this.currentTrack = null;
    }
}

export const audio = new SoundManager();

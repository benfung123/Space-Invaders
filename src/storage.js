/**
 * Storage abstraction layer.
 * Default implementation uses localStorage.
 * Can be swapped for Capacitor Preferences on mobile without touching game code.
 */
export const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* silently fail on WebView storage errors */
        }
    },
    getJson(key) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : null;
        } catch {
            return null;
        }
    },
    setJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* silently fail on WebView storage errors */
        }
    }
};

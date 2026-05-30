/**
 * Storage abstraction layer.
 * Default implementation uses localStorage.
 * Can be swapped for Capacitor Preferences on mobile without touching game code.
 */
export const storage = {
    get(key) {
        return localStorage.getItem(key);
    },
    set(key, value) {
        localStorage.setItem(key, value);
    },
    getJson(key) {
        const v = localStorage.getItem(key);
        try {
            return v ? JSON.parse(v) : null;
        } catch {
            return null;
        }
    },
    setJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

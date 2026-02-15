/**
 * Bitform 3D Viewer — UI Utilities
 * 
 * Helper functions for the loading screen, 
 * toast notifications, and UI state management.
 */

// ============================================
// Loading Screen
// ============================================

/**
 * Update the loading status text
 * @param {string} message 
 */
export function setLoadingStatus(message) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = message;
}

/**
 * Set the loading progress bar width
 * @param {number} percent - 0 to 100
 */
export function setLoadingProgress(percent) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

/**
 * Hide the loading screen with a fade animation
 */
export function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (!screen) return;

    screen.classList.add('fade-out');
    setTimeout(() => {
        screen.style.display = 'none';
    }, 600);
}

// ============================================
// Toast Notifications
// ============================================

let toastTimeout = null;

/**
 * Show a toast notification
 * @param {string} message - Text to display
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');

    if (!toast || !msgEl) return;

    // Clear previous timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    msgEl.textContent = message;
    toast.classList.remove('toast-hidden');

    toastTimeout = setTimeout(() => {
        toast.classList.add('toast-hidden');
        toastTimeout = null;
    }, duration);
}

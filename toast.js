/**
 * Toast Notification System
 * Provides a simple way to show toast notifications for user feedback
 */

class Toast {
    static container = null;
    static toastId = 0;

    /**
     * Initialize the toast container
     * @param {string} position - Position of the toast container (top-right, bottom-right, top-left, bottom-left)
     */
    static init(position = 'top-right') {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = `toast-container ${position}`;
        document.body.appendChild(this.container);
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - The type of toast (success, error, warning, info)
     * @param {Object} options - Additional options
     * @param {string} options.title - Optional title for the toast
     * @param {number} options.duration - Duration in milliseconds (default: 4000)
     * @param {boolean} options.closeable - Whether the toast can be closed manually (default: true)
     * @param {Function} options.onClose - Callback when toast is closed
     */
    static show(message, type = 'info', options = {}) {
        const {
            title = this.getDefaultTitle(type),
            duration = 4000,
            closeable = true,
            onClose = null
        } = options;

        if (!this.container) {
            this.init();
        }

        const id = ++this.toastId;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.id = id;

        const icon = this.getIcon(type);

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            ${closeable ? '<button class="toast-close" aria-label="Close">&times;</button>' : ''}
            <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
        `;

        this.container.appendChild(toast);

        // Close button handler
        if (closeable) {
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => this.dismiss(id, onClose));
        }

        // Auto dismiss
        const timeoutId = setTimeout(() => {
            this.dismiss(id, onClose);
        }, duration);

        // Store timeout for potential manual dismissal
        toast.dataset.timeoutId = timeoutId;

        return id;
    }

    /**
     * Show a success toast
     */
    static success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    /**
     * Show an error toast
     */
    static error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    /**
     * Show a warning toast
     */
    static warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    /**
     * Show an info toast
     */
    static info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    /**
     * Dismiss a toast by ID
     */
    static dismiss(id, onClose = null) {
        const toast = this.container?.querySelector(`[data-id="${id}"]`);
        if (!toast) return;

        // Clear the auto-dismiss timeout
        if (toast.dataset.timeoutId) {
            clearTimeout(parseInt(toast.dataset.timeoutId));
        }

        toast.classList.add('removing');

        toast.addEventListener('animationend', () => {
            toast.remove();
            if (onClose) onClose(id);
        });
    }

    /**
     * Dismiss all toasts
     */
    static dismissAll() {
        if (!this.container) return;

        const toasts = this.container.querySelectorAll('.toast');
        toasts.forEach(toast => {
            const id = parseInt(toast.dataset.id);
            this.dismiss(id);
        });
    }

    /**
     * Get default title for toast type
     */
    static getDefaultTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        return titles[type] || 'Notification';
    }

    /**
     * Get icon SVG for toast type
     */
    static getIcon(type) {
        const icons = {
            success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>`,
            warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>`
        };
        return icons[type] || icons.info;
    }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Toast.init());
} else {
    Toast.init();
}

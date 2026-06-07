// Duration Formatter
export function formatDuration(ms) {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Parse error response from backend API
export async function getResponseError(response) {
  let fallbackMsg = `Request failed with status ${response.status}`;
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (json && json.error) {
        return json.error;
      }
    } catch (_) {
      if (text && text.trim().length > 0 && text.length < 200) {
        return text;
      }
    }
  } catch (_) {}
  return fallbackMsg;
}

// Subtle Toast Notifications
export function showSuccessToast(message) {
  showToast(message, 'success');
}

export function showWarningToast(message) {
  showToast(message, 'warning');
}

export function showErrorToast(message) {
  showToast(message, 'error');
}

export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '110px';
  toast.style.right = '40px';
  toast.style.background = type === 'success' ? '#34c759' : (type === 'warning' ? '#ff9f0a' : '#ff3b30');
  toast.style.color = 'white';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.zIndex = '999';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '600';
  toast.style.fontFamily = 'var(--font-family-body)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';
  toast.style.transition = 'all 0.3s ease';

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 50);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

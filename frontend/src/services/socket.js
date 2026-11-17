import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
      if (!socket) {
            socket = io(window.location.origin, {
                  transports: ['websocket', 'polling'],
                  auth: { token: localStorage.getItem('token') },
            });
      }
      return socket;
}

export function joinJobRoom(jobId) {
      getSocket().emit('join_job', jobId);
}

export function leaveJobRoom(jobId) {
      getSocket().emit('leave_job', jobId);
}

export function onProgress(callback) {
      const s = getSocket();
      s.on('progress', callback);
      return () => s.off('progress', callback);
}

export function onLog(callback) {
      const s = getSocket();
      s.on('log', callback);
      return () => s.off('log', callback);
}

export function onJobCompleted(callback) {
      const s = getSocket();
      s.on('job_completed', callback);
      return () => s.off('job_completed', callback);
}

export function onCaptchaRequired(callback) {
      const s = getSocket();
      s.on('captcha_required', callback);
      return () => s.off('captcha_required', callback);
}

/** captcha_status: { jobId, status: 'solving'|'filling'|'solved'|'wrong'|'failed'|'detected', text } */
export function onCaptchaStatus(callback) {
      const s = getSocket();
      s.on('captcha_status', callback);
      return () => s.off('captcha_status', callback);
}

export function onTabsStatus(callback) {
      const s = getSocket();
      s.on('tabs_status', callback);
      return () => s.off('tabs_status', callback);
}

export function resolveCaptcha(jobId, tabId = null) {
      getSocket().emit('captcha_resolved', { jobId, tabId });
}

export function disconnectSocket() {
      if (socket) {
            socket.disconnect();
            socket = null;
      }
}

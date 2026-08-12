export const TIMER_MODE = {
    stopwatch: "stopwatch",
    pomodoro: "pomodoro",
};

export const POMODORO_SECONDS = 25 * 60;
export const POMODORO_REST_SECONDS = 5 * 60;

export function formatTimerSeconds(totalSeconds = 0) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getPomodoroRemaining(startedAt, nowMs = Date.now(), durationSeconds = POMODORO_SECONDS) {
    if (!startedAt) return durationSeconds;
    const startedAtMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) return durationSeconds;
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    return Math.max(0, durationSeconds - elapsedSeconds);
}

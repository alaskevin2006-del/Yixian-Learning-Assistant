import { useEffect, useState } from "react";

function readLocal(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeLocal(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best effort local state.
    }
}

export function useLocalState(key, fallback) {
    const [value, setValue] = useState(() => readLocal(key, fallback));
    useEffect(() => writeLocal(key, value), [key, value]);
    return [value, setValue];
}

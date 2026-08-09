import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "click",
  "input",
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
];

export default function useInactivityLogout(onInactive, timeoutMs = 15 * 60 * 1000, enabled = true) {
  const onInactiveRef = useRef(onInactive);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    onInactiveRef.current = onInactive;
  }, [onInactive]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timeoutId;
    const clearTimer = () => window.clearTimeout(timeoutId);
    const runInactive = () => {
      clearTimer();
      onInactiveRef.current?.();
    };
    const scheduleTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        runInactive();
      }, timeoutMs);
    };
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      scheduleTimer();
    };
    const checkElapsedIdleTime = () => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        runInactive();
        return;
      }
      scheduleTimer();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkElapsedIdleTime();
      }
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });
    window.addEventListener("focus", checkElapsedIdleTime);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
      window.removeEventListener("focus", checkElapsedIdleTime);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, timeoutMs]);
}

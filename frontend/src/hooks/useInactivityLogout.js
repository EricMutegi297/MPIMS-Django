import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
];

export default function useInactivityLogout(onInactive, timeoutMs = 15 * 60 * 1000, enabled = true) {
  const onInactiveRef = useRef(onInactive);

  useEffect(() => {
    onInactiveRef.current = onInactive;
  }, [onInactive]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timeoutId;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        onInactiveRef.current?.();
      }, timeoutMs);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [enabled, timeoutMs]);
}

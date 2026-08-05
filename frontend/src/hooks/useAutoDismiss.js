import { useEffect } from "react";

export default function useAutoDismiss(value, clearValue, delay = 3000) {
  useEffect(() => {
    if (!value) return undefined;

    const timer = window.setTimeout(() => clearValue(""), delay);
    return () => window.clearTimeout(timer);
  }, [value, clearValue, delay]);
}

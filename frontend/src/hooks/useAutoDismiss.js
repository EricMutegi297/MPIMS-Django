import { useEffect } from "react";

export default function useAutoDismiss(value, setValue, delay = 4500, emptyValue = "") {
  useEffect(() => {
    if (!value) return undefined;
    const timer = window.setTimeout(() => {
      setValue(emptyValue);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [value, setValue, delay, emptyValue]);
}

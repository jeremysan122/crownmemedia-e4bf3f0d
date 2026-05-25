import { useCallback, useEffect, useRef, useState } from "react";

export function useGiftCombo(timeoutMs = 3500) {
  const [comboCount, setComboCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerGiftSend = useCallback(() => {
    setComboCount((c) => c + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setComboCount(0), timeoutMs);
  }, [timeoutMs]);

  const reset = useCallback(() => {
    setComboCount(0);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { comboCount, registerGiftSend, reset };
}

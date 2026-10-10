import { useState, useEffect, useRef } from "react";

/**
 * Hook personnalisé pour gérer les messages flash temporaires
 * avec protection contre les mises à jour sur des composants démontés
 * (évite l'erreur React #310 "Invalid update")
 */
export function useFlash(duration = 3500) {
  const [msg, setMsg] = useState("");
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const flash = (t) => {
    if (isMounted.current) {
      setMsg(t);
      setTimeout(() => {
        if (isMounted.current) {
          setMsg("");
        }
      }, duration);
    }
  };

  return [msg, flash];
}

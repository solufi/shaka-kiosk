'use client';
import { useState, useEffect, useRef } from 'react';

interface UseIdleOptions {
  onIdle: () => void;
  idleTime: number;
}

export const useIdle = ({ onIdle, idleTime }: UseIdleOptions) => {
  const timeoutId = useRef<number | null>(null);

  const resetTimer = () => {
    if (timeoutId.current) {
      window.clearTimeout(timeoutId.current);
    }
    timeoutId.current = window.setTimeout(onIdle, idleTime);
  };

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    
    const handleEvent = () => {
      resetTimer();
    };

    events.forEach(event => window.addEventListener(event, handleEvent));
    resetTimer(); // Initialize timer

    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
      events.forEach(event => window.removeEventListener(event, handleEvent));
    };
  }, [idleTime, onIdle]); // Re-run effect if idleTime or onIdle changes

  return null; // This hook does not return a value
};

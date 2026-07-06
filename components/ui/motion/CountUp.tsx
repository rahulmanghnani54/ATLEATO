/**
 * CountUp — animates a number from its previous value to a new one.
 *
 * Stats shouldn't just appear — they should tick up. Punchy: fast (650ms) with
 * an ease-out so it rockets then settles.
 *   <CountUp value={1240} style={styles.big} suffix=" kcal" />
 *
 * Driven on the JS thread via requestAnimationFrame — it animates ONCE when the
 * value changes (not per-frame in a gesture), so this is cheap and predictable.
 * Respects locale grouping and a fixed decimal count.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';

export interface CountUpProps extends TextProps {
  value: number;
  /** Animation duration in ms. Default 650. */
  duration?: number;
  /** Decimal places. Default 0. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands with commas. Default true. */
  grouped?: boolean;
}

// Ease-out cubic — rockets out of the gate, glides to a stop.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function CountUp({
  value,
  duration = 650,
  decimals = 0,
  prefix = '',
  suffix = '',
  grouped = true,
  ...textProps
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    startRef.current = 0;

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOut(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value; // if interrupted, next run starts from here
    };
  }, [value, duration]);

  const rounded = decimals > 0
    ? display.toFixed(decimals)
    : String(Math.round(display));
  const formatted = grouped && decimals === 0
    ? Math.round(display).toLocaleString('en-US')
    : rounded;

  return <Text {...textProps}>{prefix}{formatted}{suffix}</Text>;
}

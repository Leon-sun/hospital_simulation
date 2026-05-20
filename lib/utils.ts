import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatDays(value: number) {
  return `${value.toFixed(1)} days`;
}

/** Surgical wait: prefer hours when the interval is under 48 hours. */
export function formatSurgicalWait(waitDays: number) {
  const hours = waitDays * 24;
  if (hours < 48) {
    return `${hours.toFixed(1)} hours`;
  }
  return formatDays(waitDays);
}

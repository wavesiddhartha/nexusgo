import clsx, { type ClassValue } from 'clsx';

/**
 * Merge Tailwind class names conditionally.
 * Thin wrapper around clsx (no twMerge needed since we control all classes).
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

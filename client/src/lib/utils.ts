import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Merge conditional class names (clsx) then dedupe conflicting Tailwind classes (tailwind-merge).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

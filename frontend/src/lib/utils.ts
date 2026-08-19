import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | { toDate: () => Date } | null | undefined): string {
  if (!date) return 'Just now'
  try {
    const d = typeof (date as any).toDate === 'function' ? (date as any).toDate() : date as Date
    if (isNaN(d.getTime())) return 'Just now'
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d)
  } catch {
    return 'Just now'
  }
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str
}
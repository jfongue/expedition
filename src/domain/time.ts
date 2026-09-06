/** Minutes elapsed since midnight of the current day. */
export type Minutes = number

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export interface DayCycle {
  /** Earliest possible departure from the ship. */
  sunrise: Minutes
  /** Hard deadline for a free return: the shuttle leaves. */
  sunset: Minutes
  /** How long before sunset the light starts to go — estimates get shakier. */
  duskLength: Minutes
  /** Past this, an explorer still on the ground is lost. Usually midnight. */
  deadline: Minutes
}

export const DEFAULT_CYCLE: DayCycle = {
  sunrise: 6 * 60,
  sunset: 20 * 60,
  duskLength: 90,
  deadline: MINUTES_PER_DAY,
}

export type DayPhase = 'before-sunrise' | 'day' | 'dusk' | 'night'

export function phaseAt(cycle: DayCycle, at: Minutes): DayPhase {
  if (at < cycle.sunrise) return 'before-sunrise'
  if (at >= cycle.sunset) return 'night'
  if (at >= cycle.sunset - cycle.duskLength) return 'dusk'
  return 'day'
}

export function daylightLength(cycle: DayCycle): Minutes {
  return cycle.sunset - cycle.sunrise
}

/**
 * Where `at` sits in the day, as 0 (sunrise) to 1 (sunset). Clamped, so a plan
 * that overruns sunset keeps reporting 1 rather than exploding.
 */
export function dayProgress(cycle: DayCycle, at: Minutes): number {
  const span = daylightLength(cycle)
  if (span <= 0) return 1
  return clamp01((at - cycle.sunrise) / span)
}

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** "18:05". Minutes past the end of the day wrap, so 1500 reads "01:00". */
export function formatClock(at: Minutes): string {
  const wrapped = ((Math.round(at) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(wrapped / MINUTES_PER_HOUR)
  const minutes = wrapped % MINUTES_PER_HOUR
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** "1h20", "45min" — for countdowns rather than clock times. */
export function formatDuration(minutes: Minutes): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / MINUTES_PER_HOUR)
  const rest = total % MINUTES_PER_HOUR
  if (hours === 0) return `${rest}min`
  if (rest === 0) return `${hours}h`
  return `${hours}h${String(rest).padStart(2, '0')}`
}

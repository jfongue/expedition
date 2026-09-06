import { describe, expect, it } from 'vitest'
import { DEFAULT_CYCLE, dayProgress, formatClock, formatDuration, phaseAt } from './time'

describe('day cycle', () => {
  it('names the phases of the day', () => {
    expect(phaseAt(DEFAULT_CYCLE, 5 * 60)).toBe('before-sunrise')
    expect(phaseAt(DEFAULT_CYCLE, 12 * 60)).toBe('day')
    expect(phaseAt(DEFAULT_CYCLE, 19 * 60)).toBe('dusk')
    expect(phaseAt(DEFAULT_CYCLE, 21 * 60)).toBe('night')
  })

  it('measures progress through daylight and clamps outside it', () => {
    expect(dayProgress(DEFAULT_CYCLE, DEFAULT_CYCLE.sunrise)).toBe(0)
    expect(dayProgress(DEFAULT_CYCLE, DEFAULT_CYCLE.sunset)).toBe(1)
    expect(dayProgress(DEFAULT_CYCLE, 13 * 60)).toBeCloseTo(0.5, 5)
    expect(dayProgress(DEFAULT_CYCLE, 3 * 60)).toBe(0)
    expect(dayProgress(DEFAULT_CYCLE, 23 * 60)).toBe(1)
  })

  it('formats clock times and durations', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(6 * 60 + 5)).toBe('06:05')
    expect(formatClock(1500)).toBe('01:00')
    expect(formatDuration(45)).toBe('45min')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(80)).toBe('1h20')
  })
})

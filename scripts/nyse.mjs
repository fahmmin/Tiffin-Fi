// NYSE regular hours in New York time, shared by the price scripts.
// NYSE full-day closures and 1 pm early closes, New York dates.
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])
const EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26'])

export function nyseOpen(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const day = `${parts.year}-${parts.month}-${parts.day}`
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun' || HOLIDAYS.has(day)) return false
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  const close = EARLY_CLOSES.has(day) ? 13 * 60 : 16 * 60
  return minutes >= 9 * 60 + 30 && minutes < close
}

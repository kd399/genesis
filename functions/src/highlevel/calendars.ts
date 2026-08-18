import { createHLClient } from './client'

export interface HLCalendar {
  id: string
  name: string
  locationId: string
  isActive: boolean
}

export interface HLAppointment {
  id: string
  calendarId: string
  contactId: string
  title: string
  startTime: string
  endTime: string
  status: string
  notes: string
}

export async function listCalendars(
  userId: string,
  locationId: string
): Promise<{ calendars: HLCalendar[] }> {
  const client = createHLClient(userId)
  // GET /calendars — locationId as query param, no trailing slash
  const res = await client.get('/calendars/', { params: { locationId } })
  return { calendars: res.data.calendars ?? [] }
}

export async function getAppointments(
  userId: string,
  locationId: string,
  options?: {
    startTime?: string // ISO string — we convert to Unix ms for HL
    endTime?: string // ISO string — we convert to Unix ms for HL
    calendarId?: string // preferred: if provided, scope to this calendar
  }
): Promise<{ appointments: HLAppointment[] }> {
  const client = createHLClient(userId)
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // HL /calendars/events expects startTime/endTime as Unix milliseconds
  const startMs = options?.startTime ? new Date(options.startTime).getTime() : now.getTime()
  const endMs = options?.endTime ? new Date(options.endTime).getTime() : weekLater.getTime()

  // HL /calendars/events REQUIRES at least one of: userId, calendarId, groupId
  // along with locationId + time range.
  // Strategy: use provided calendarId if available; otherwise fetch the first
  // calendar for this location and use its ID.
  let calendarId = options?.calendarId

  if (!calendarId) {
    try {
      const { calendars } = await listCalendars(userId, locationId)
      calendarId = calendars[0]?.id
    } catch {
      // If calendar fetch fails, fall through — HL will return 422 and we surface it
    }
  }

  if (!calendarId) {
    // No calendars in this location — return empty rather than hitting a 422
    console.warn('getAppointments: no calendarId found for locationId', locationId)
    return { appointments: [] }
  }

  const params: Record<string, string | number> = {
    locationId,
    startTime: startMs,
    endTime: endMs,
    calendarId
  }

  // GET /calendars/events
  const res = await client.get('/calendars/events', { params })

  // HL returns { events: [...] } — each event has appointmentStatus
  const events = res.data.events ?? res.data.appointments ?? []
  const appointments: HLAppointment[] = events.map((e: Record<string, unknown>) => ({
    id: e.id as string,
    calendarId: e.calendarId as string,
    contactId: e.contactId as string,
    title: (e.title ?? e.name ?? '') as string,
    startTime: e.startTime as string,
    endTime: e.endTime as string,
    status: (e.appointmentStatus ?? e.status ?? '') as string,
    notes: (e.notes ?? '') as string
  }))

  return { appointments }
}

export async function getAvailability(
  userId: string,
  calendarId: string,
  options: {
    startDate: string
    endDate: string
    timezone?: string
  }
): Promise<{ slots: Record<string, string[]> }> {
  const client = createHLClient(userId)
  const res = await client.get(`/calendars/${calendarId}/free-slots`, {
    params: {
      startDate: options.startDate,
      endDate: options.endDate,
      timezone: options.timezone ?? 'UTC'
    }
  })
  return { slots: res.data ?? {} }
}

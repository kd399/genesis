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
  // No trailing slash — HL is strict about this
  const res = await client.get('/calendars', { params: { locationId } })
  return { calendars: res.data.calendars ?? [] }
}

export async function getAppointments(
  userId: string,
  locationId: string,
  options?: {
    startTime?: string // ISO string — we convert to Unix ms for HL
    endTime?: string // ISO string — we convert to Unix ms for HL
    calendarId?: string
  }
): Promise<{ appointments: HLAppointment[] }> {
  const client = createHLClient(userId)
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // HL /calendars/events expects startTime/endTime as Unix milliseconds
  const startMs = options?.startTime ? new Date(options.startTime).getTime() : now.getTime()
  const endMs = options?.endTime ? new Date(options.endTime).getTime() : weekLater.getTime()

  const params: Record<string, string | number> = {
    locationId,
    startTime: startMs,
    endTime: endMs
  }
  if (options?.calendarId) params.calendarId = options.calendarId

  // Correct endpoint is /calendars/events (NOT /calendars/events/appointments)
  const res = await client.get('/calendars/events', { params })

  // HL returns { events: [...] } — each event has appointmentStatus
  // Normalize to our shape so generated apps have a consistent contract
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

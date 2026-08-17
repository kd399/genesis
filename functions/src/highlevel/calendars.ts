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
  const res = await client.get('/calendars/', { params: { locationId } })
  return { calendars: res.data.calendars ?? [] }
}

export async function getAppointments(
  userId: string,
  locationId: string,
  options?: {
    startTime?: string
    endTime?: string
    calendarId?: string
  }
): Promise<{ appointments: HLAppointment[] }> {
  const client = createHLClient(userId)
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const res = await client.get('/calendars/events/appointments', {
    params: {
      locationId,
      startTime: options?.startTime ?? now.toISOString(),
      endTime: options?.endTime ?? weekLater.toISOString(),
      ...(options?.calendarId ? { calendarId: options.calendarId } : {})
    }
  })
  return { appointments: res.data.appointments ?? [] }
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

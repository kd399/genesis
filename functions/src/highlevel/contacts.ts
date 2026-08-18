import { createHLClient } from './client'

export interface HLContact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  locationId: string
  dateAdded: string
  tags: string[]
}

export async function listContacts(
  userId: string,
  locationId: string,
  options?: {
    limit?: number
    // NOTE: HL deprecated `skip` — pagination is now cursor-based via `startAfter`
    startAfter?: number // Unix ms timestamp of last contact's dateAdded
    startAfterId?: string // ID of last contact (used together with startAfter)
    query?: string
  }
): Promise<{
  contacts: HLContact[]
  count: number
  meta?: { total: number; nextPageUrl?: string; startAfter?: number; startAfterId?: string }
}> {
  const client = createHLClient(userId)
  const params: Record<string, string | number> = {
    locationId,
    limit: options?.limit ?? 20
  }

  // HL uses cursor-based pagination — "skip" is rejected with 422
  // Use startAfter (Unix ms) + startAfterId for subsequent pages
  if (options?.startAfter) params.startAfter = options.startAfter
  if (options?.startAfterId) params.startAfterId = options.startAfterId
  if (options?.query) params.query = options.query

  const res = await client.get('/contacts/', { params })
  return {
    contacts: res.data.contacts ?? [],
    count: res.data.count ?? 0,
    meta: res.data.meta
  }
}

export async function createContact(
  userId: string,
  locationId: string,
  data: {
    firstName: string
    lastName: string
    email: string
    phone?: string
  }
): Promise<HLContact> {
  const client = createHLClient(userId)
  const res = await client.post('/contacts/', { ...data, locationId })
  return res.data.contact
}

export async function updateContact(
  userId: string,
  contactId: string,
  data: Partial<{
    firstName: string
    lastName: string
    email: string
    phone: string
  }>
): Promise<HLContact> {
  const client = createHLClient(userId)
  const res = await client.put(`/contacts/${contactId}`, data)
  return res.data.contact
}

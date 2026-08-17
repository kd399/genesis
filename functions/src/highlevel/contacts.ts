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
    skip?: number
    query?: string
  }
): Promise<{ contacts: HLContact[]; count: number }> {
  const client = createHLClient(userId)
  const params: Record<string, string | number> = {
    locationId,
    limit: options?.limit ?? 20,
    skip: options?.skip ?? 0
  }
  if (options?.query) params.query = options.query

  const res = await client.get('/contacts/', { params })
  return {
    contacts: res.data.contacts ?? [],
    count: res.data.count ?? 0
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

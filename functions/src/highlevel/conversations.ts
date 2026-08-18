import { createHLClient } from './client'

export interface HLConversation {
  id: string
  contactId: string
  locationId: string
  lastMessageBody: string
  lastMessageDate: string
  type: string
  unreadCount: number
}

export interface HLMessage {
  id: string
  conversationId: string
  body: string
  direction: 'inbound' | 'outbound'
  dateAdded: string
  type: string
}

export async function listConversations(
  userId: string,
  locationId: string,
  options?: {
    limit?: number
    startAfterDate?: string
  }
): Promise<{ conversations: HLConversation[] }> {
  const client = createHLClient(userId)
  const res = await client.get('/conversations/search', {
    params: {
      locationId,
      limit: options?.limit ?? 20,
      ...(options?.startAfterDate ? { startAfterDate: options.startAfterDate } : {})
    }
  })
  // HL returns conversations under "conversations" key
  return { conversations: res.data.conversations ?? [] }
}

export async function getMessages(
  userId: string,
  conversationId: string
): Promise<{ messages: HLMessage[] }> {
  const client = createHLClient(userId)
  const res = await client.get(`/conversations/${conversationId}/messages`)
  return { messages: res.data.messages ?? [] }
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  body: string
): Promise<HLMessage> {
  const client = createHLClient(userId)
  const res = await client.post(`/conversations/${conversationId}/messages`, {
    type: 'SMS',
    message: body
  })
  return res.data.message
}

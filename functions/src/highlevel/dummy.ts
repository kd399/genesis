/**
 * Realistic dummy data returned when HighLevel is not connected.
 * Allows full end-to-end testing without a HighLevel account.
 */

export function getDummyContacts(query?: string) {
  const contacts = [
    {
      id: 'c1',
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@example.com',
      phone: '+1 (555) 201-4567',
      tags: ['VIP', 'Enterprise'],
      dateAdded: '2024-11-15T09:00:00Z'
    },
    {
      id: 'c2',
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@techcorp.io',
      phone: '+1 (555) 302-8910',
      tags: ['Lead'],
      dateAdded: '2024-12-01T14:30:00Z'
    },
    {
      id: 'c3',
      firstName: 'Emily',
      lastName: 'Rodriguez',
      email: 'emily.r@creativeco.com',
      phone: '+1 (555) 403-2345',
      tags: ['Customer'],
      dateAdded: '2025-01-08T11:00:00Z'
    },
    {
      id: 'c4',
      firstName: 'David',
      lastName: 'Kim',
      email: 'david.kim@startupxyz.com',
      phone: '+1 (555) 504-6789',
      tags: ['Lead', 'Hot'],
      dateAdded: '2025-02-14T16:00:00Z'
    },
    {
      id: 'c5',
      firstName: 'Jessica',
      lastName: 'Martinez',
      email: 'jess.m@consult.net',
      phone: '+1 (555) 605-0123',
      tags: ['Customer', 'VIP'],
      dateAdded: '2025-03-20T10:00:00Z'
    },
    {
      id: 'c6',
      firstName: 'Tom',
      lastName: 'Wilson',
      email: 'tom.w@bigco.org',
      phone: '+1 (555) 706-4567',
      tags: ['Enterprise'],
      dateAdded: '2025-04-05T13:00:00Z'
    },
    {
      id: 'c7',
      firstName: 'Aisha',
      lastName: 'Patel',
      email: 'aisha.p@design.studio',
      phone: '+1 (555) 807-8901',
      tags: ['Lead'],
      dateAdded: '2025-05-11T09:30:00Z'
    },
    {
      id: 'c8',
      firstName: 'Carlos',
      lastName: 'Nguyen',
      email: 'carlos.n@agency.co',
      phone: '+1 (555) 908-2345',
      tags: ['Customer'],
      dateAdded: '2025-06-18T15:00:00Z'
    }
  ]
  const filtered = query
    ? contacts.filter(c =>
        `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(query.toLowerCase())
      )
    : contacts
  return { contacts: filtered, count: filtered.length, isDummy: true }
}

export function getDummyConversations() {
  const now = Date.now()
  return {
    conversations: [
      {
        id: 'cv1',
        contactId: 'c1',
        lastMessageBody: 'Can we schedule a follow-up call this week?',
        lastMessageDate: new Date(now - 15 * 60000).toISOString(),
        unreadCount: 2,
        type: 'SMS'
      },
      {
        id: 'cv2',
        contactId: 'c2',
        lastMessageBody: 'Thanks for the proposal, reviewing now.',
        lastMessageDate: new Date(now - 2 * 3600000).toISOString(),
        unreadCount: 0,
        type: 'Email'
      },
      {
        id: 'cv3',
        contactId: 'c3',
        lastMessageBody: 'Please send over the contract details.',
        lastMessageDate: new Date(now - 5 * 3600000).toISOString(),
        unreadCount: 1,
        type: 'SMS'
      },
      {
        id: 'cv4',
        contactId: 'c4',
        lastMessageBody: 'I have some questions about pricing.',
        lastMessageDate: new Date(now - 1 * 86400000).toISOString(),
        unreadCount: 0,
        type: 'Email'
      },
      {
        id: 'cv5',
        contactId: 'c5',
        lastMessageBody: 'Looking forward to our meeting tomorrow!',
        lastMessageDate: new Date(now - 2 * 86400000).toISOString(),
        unreadCount: 0,
        type: 'SMS'
      }
    ],
    isDummy: true
  }
}

export function getDummyAppointments() {
  const now = Date.now()
  const day = 86400000
  return {
    appointments: [
      {
        id: 'a1',
        title: 'Discovery Call — Sarah Johnson',
        contactId: 'c1',
        calendarId: 'cal1',
        startTime: new Date(now + 2 * 3600000).toISOString(),
        endTime: new Date(now + 3 * 3600000).toISOString(),
        status: 'confirmed',
        notes: 'Discuss enterprise plan options'
      },
      {
        id: 'a2',
        title: 'Product Demo — Michael Chen',
        contactId: 'c2',
        calendarId: 'cal1',
        startTime: new Date(now + 1 * day + 1 * 3600000).toISOString(),
        endTime: new Date(now + 1 * day + 2 * 3600000).toISOString(),
        status: 'confirmed',
        notes: 'Full platform walkthrough'
      },
      {
        id: 'a3',
        title: 'Follow-up — Emily Rodriguez',
        contactId: 'c3',
        calendarId: 'cal2',
        startTime: new Date(now + 1 * day + 4 * 3600000).toISOString(),
        endTime: new Date(now + 1 * day + 5 * 3600000).toISOString(),
        status: 'pending',
        notes: 'Contract review'
      },
      {
        id: 'a4',
        title: 'Onboarding — Jessica Martinez',
        contactId: 'c5',
        calendarId: 'cal1',
        startTime: new Date(now + 2 * day + 2 * 3600000).toISOString(),
        endTime: new Date(now + 2 * day + 3 * 3600000).toISOString(),
        status: 'confirmed',
        notes: 'Platform onboarding session'
      },
      {
        id: 'a5',
        title: 'Strategy Call — Tom Wilson',
        contactId: 'c6',
        calendarId: 'cal2',
        startTime: new Date(now + 3 * day + 3 * 3600000).toISOString(),
        endTime: new Date(now + 3 * day + 4 * 3600000).toISOString(),
        status: 'confirmed',
        notes: 'Q3 strategy alignment'
      },
      {
        id: 'a6',
        title: 'Check-in — Aisha Patel',
        contactId: 'c7',
        calendarId: 'cal1',
        startTime: new Date(now + 4 * day + 1 * 3600000).toISOString(),
        endTime: new Date(now + 4 * day + 2 * 3600000).toISOString(),
        status: 'pending',
        notes: ''
      }
    ],
    isDummy: true
  }
}

export function getDummyCalendars() {
  return {
    calendars: [
      { id: 'cal1', name: 'Sales Team', isActive: true, locationId: 'demo' },
      { id: 'cal2', name: 'Customer Success', isActive: true, locationId: 'demo' }
    ],
    isDummy: true
  }
}

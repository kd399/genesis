import * as admin from 'firebase-admin'

// Initialize only once
if (!admin.apps.length) {
  admin.initializeApp()
}

export const db = admin.firestore()
export const auth = admin.auth()
export default admin

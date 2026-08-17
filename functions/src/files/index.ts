import * as functions from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../admin'
import { verifyAuth } from '../auth/middleware'

// GET /listFiles?projectId=xxx
export const listFiles = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const projectId = req.query.projectId as string
    if (!projectId) {
      res.status(400).json({ error: 'projectId required' })
      return
    }

    // Verify project ownership
    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists || projSnap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const filesSnap = await db
      .collection('projects')
      .doc(projectId)
      .collection('files')
      .orderBy('path')
      .get()

    const files = filesSnap.docs.map(d => ({ id: d.id, path: d.data().path }))
    res.json({ files })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /getFile?projectId=xxx&path=src/App.vue
export const getFile = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const projectId = req.query.projectId as string
    const filePath = req.query.path as string
    if (!projectId || !filePath) {
      res.status(400).json({ error: 'projectId and path required' })
      return
    }

    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists || projSnap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // File ID is the path with slashes replaced
    const fileId = filePath.replace(/\//g, '__')
    const fileSnap = await db
      .collection('projects')
      .doc(projectId)
      .collection('files')
      .doc(fileId)
      .get()

    if (!fileSnap.exists) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    res.json({ file: { id: fileSnap.id, ...fileSnap.data() } })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /saveFile
export const saveFile = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const { projectId, path, content } = req.body
    if (!projectId || !path || content === undefined) {
      res.status(400).json({ error: 'projectId, path, and content required' })
      return
    }

    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists || projSnap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const fileId = (path as string).replace(/\//g, '__')
    await db
      .collection('projects')
      .doc(projectId)
      .collection('files')
      .doc(fileId)
      .set({ path, content, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

    // Update project updatedAt
    await db
      .collection('projects')
      .doc(projectId)
      .update({ updatedAt: FieldValue.serverTimestamp() })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

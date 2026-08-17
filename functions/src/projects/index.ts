import * as functions from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../admin'
import { verifyAuth } from '../auth/middleware'

// GET /projects
export const listProjects = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const snap = await db
      .collection('projects')
      .where('userId', '==', uid)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .get()

    const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    res.json({ projects })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    res.status(code === 'unauthenticated' ? 401 : 500).json({ error: String(err) })
  }
})

// POST /projects
export const createProject = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const { name, description, highLevelLocationId } = req.body

    if (!name || !highLevelLocationId) {
      res.status(400).json({ error: 'name and highLevelLocationId are required' })
      return
    }

    const data = {
      userId: uid,
      name,
      description: description ?? '',
      highLevelLocationId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null
    }

    const ref = await db.collection('projects').add(data)
    res.json({ project: { id: ref.id, ...data } })
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /projects/:id
export const updateProject = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const projectId = req.path.split('/').pop()!

    const ref = db.collection('projects').doc(projectId)
    const snap = await ref.get()

    if (!snap.exists || snap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const { name, description } = req.body
    await ref.update({ name, description, updatedAt: FieldValue.serverTimestamp() })
    res.json({ success: true })
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /projects/:id (soft delete)
export const deleteProject = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const projectId = req.path.split('/').pop()!

    const ref = db.collection('projects').doc(projectId)
    const snap = await ref.get()

    if (!snap.exists || snap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    await ref.update({ deletedAt: FieldValue.serverTimestamp() })
    res.json({ success: true })
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

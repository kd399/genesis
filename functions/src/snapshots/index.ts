import * as functions from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../admin'
import { verifyAuth } from '../auth/middleware'

// GET /listSnapshots?projectId=xxx
export const listSnapshots = functions.https.onRequest(async (req, res) => {
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

    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists || projSnap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection('snapshots')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()

    const snapshots = snap.docs.map(d => ({
      id: d.id,
      projectId,
      generationId: d.data().generationId,
      filesCount: (d.data().files ?? []).length,
      createdAt: d.data().createdAt
    }))

    res.json({ snapshots })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /restoreSnapshot
export const restoreSnapshot = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const uid = await verifyAuth(req)
    const { projectId, snapshotId } = req.body
    if (!projectId || !snapshotId) {
      res.status(400).json({ error: 'projectId and snapshotId required' })
      return
    }

    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists || projSnap.data()!.userId !== uid) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const snapDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('snapshots')
      .doc(snapshotId)
      .get()

    if (!snapDoc.exists) {
      res.status(404).json({ error: 'Snapshot not found' })
      return
    }

    const { files } = snapDoc.data()! as { files: { path: string; content: string }[] }

    // Delete all current files
    const currentFiles = await db.collection('projects').doc(projectId).collection('files').get()

    const batch = db.batch()
    currentFiles.docs.forEach(d => batch.delete(d.ref))

    // Restore snapshot files
    files.forEach(({ path, content }) => {
      const fileId = path.replace(/\//g, '__')
      const ref = db.collection('projects').doc(projectId).collection('files').doc(fileId)
      batch.set(ref, { path, content, updatedAt: FieldValue.serverTimestamp() })
    })

    // Update project timestamp
    batch.update(db.collection('projects').doc(projectId), {
      updatedAt: FieldValue.serverTimestamp()
    })

    await batch.commit()
    res.json({ success: true, restoredFiles: files.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Internal helper — called from generation engine
export async function createSnapshot(
  projectId: string,
  generationId: string,
  files: { path: string; content: string }[]
): Promise<string> {
  const ref = await db.collection('projects').doc(projectId).collection('snapshots').add({
    generationId,
    files,
    createdAt: FieldValue.serverTimestamp()
  })
  return ref.id
}

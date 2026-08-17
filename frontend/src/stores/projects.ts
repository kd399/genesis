import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from './auth'
import type { Project, CreateProjectInput } from '@/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchProjects() {
    const authStore = useAuthStore()
    if (!authStore.user) return

    loading.value = true
    error.value = null

    try {
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', authStore.user.uid),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      projects.value = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)
    } catch (e) {
      // Try without deletedAt filter (for docs that don't have it yet)
      try {
        const q2 = query(
          collection(db, 'projects'),
          where('userId', '==', authStore.user.uid),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q2)
        projects.value = snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as Project)
          .filter(p => !p.deletedAt)
      } catch (e2) {
        error.value = 'Failed to load projects'
        console.error(e2)
      }
    } finally {
      loading.value = false
    }
  }

  async function createProject(input: CreateProjectInput): Promise<Project> {
    const authStore = useAuthStore()
    if (!authStore.user) throw new Error('Not authenticated')

    const data = {
      ...input,
      userId: authStore.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null
    }

    const docRef = await addDoc(collection(db, 'projects'), data)

    const newProject: Project = {
      id: docRef.id,
      ...input,
      userId: authStore.user.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    projects.value.unshift(newProject)
    return newProject
  }

  async function updateProject(
    id: string,
    updates: Partial<Pick<Project, 'name' | 'description'>>
  ) {
    await updateDoc(doc(db, 'projects', id), {
      ...updates,
      updatedAt: serverTimestamp()
    })
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx !== -1) {
      projects.value[idx] = { ...projects.value[idx]!, ...updates }
    }
  }

  async function deleteProject(id: string) {
    await updateDoc(doc(db, 'projects', id), {
      deletedAt: serverTimestamp()
    })
    projects.value = projects.value.filter(p => p.id !== id)
  }

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject
  }
})

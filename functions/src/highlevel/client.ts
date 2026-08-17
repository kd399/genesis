import axios, { type AxiosInstance } from 'axios'
import { refreshHighLevelToken } from './oauth'

const HL_BASE_URL = 'https://services.leadconnectorhq.com'

export function createHLClient(userId: string): AxiosInstance {
  const client = axios.create({
    baseURL: HL_BASE_URL,
    headers: { Version: '2021-07-28' }
  })

  // Auto-inject refreshed token on every request
  client.interceptors.request.use(async config => {
    const token = await refreshHighLevelToken(userId)
    config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Handle 401 — retry once after refresh
  client.interceptors.response.use(
    res => res,
    async error => {
      if (error.response?.status === 401 && !error.config._retried) {
        error.config._retried = true
        const token = await refreshHighLevelToken(userId)
        error.config.headers.Authorization = `Bearer ${token}`
        return client.request(error.config)
      }
      throw error
    }
  )

  return client
}

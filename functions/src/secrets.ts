import { defineSecret } from 'firebase-functions/params'

/** Anthropic API key — set via: firebase functions:secrets:set ANTHROPIC_API_KEY */
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

/** HighLevel OAuth client credentials */
export const HIGHLEVEL_CLIENT_ID = defineSecret('HIGHLEVEL_CLIENT_ID')
export const HIGHLEVEL_CLIENT_SECRET = defineSecret('HIGHLEVEL_CLIENT_SECRET')

/** Optional: HuggingFace token for fallback inference */
export const HF_TOKEN = defineSecret('HF_TOKEN')

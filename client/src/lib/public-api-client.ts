import axios from 'axios'
import { API_BASE_URL } from './constants'

// Plain client for the public website: no auth header, no 401→/login redirect.
// Public endpoints are anonymous and must never trigger the members/chefs login flow.
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export default publicApi

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay from '../components/AvatarDisplay'
import { availabilityDisplayString } from '../components/AvailabilityPicker'
import { resetAccountToBase } from '../utils/resetAccount'

// Logs every Supabase error to the console with context so failures never vanish silently.
// Pass a userMessage to also alert the person and let the caller bail out; omit it for
// background reads where a console log is enough. Returns true if there was an error.
function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[Admin:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

// Ways to narrow the Users tab. Key, then the label on the button.
const USER_FILTERS = [
  ['all', 'Everyone'],
  ['neighbors', 'Neighbors'],
  ['ambassadors', 'Ambassadors'],
  ['waiting', 'Waiting for approval'],
  ['admins', 'Admins'],
  ['no_vouches', 'No vouches yet'],
  ['unfinished', 'No profile yet'],
]
const USER_PAGE_SIZE = 50

// Task feedback that an admin should look at, and how to say it.

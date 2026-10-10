import { dbEnabled, getVisits } from '../db/client.js'

export async function saveVisit({ visitor, geo, pushed }) {
  const collection = getVisits()
  if (!dbEnabled || !collection) return false

  await collection.insertOne({
    ...visitor,
    geo,
    pushed: Boolean(pushed),
    createdAt: new Date(),
  })
  return true
}

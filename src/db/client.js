import { MongoClient } from 'mongodb'

const connectionString = process.env.MONGODB_URI || ''
export const dbEnabled = Boolean(connectionString)

const DB_NAME = process.env.MONGODB_DB || 'portfolio'
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || 'visits'

let client = null
let database = null
let visits = null

export function getVisits() {
  return visits
}

export async function initDatabase() {
  if (!dbEnabled) {
    console.warn('MONGODB_URI 未配置，访问记录将不会写入数据库')
    return false
  }

  client = new MongoClient(connectionString, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  })
  await client.connect()
  database = client.db(DB_NAME)
  visits = database.collection(COLLECTION_NAME)

  await visits.createIndexes([
    { key: { createdAt: -1 } },
    { key: { ip: 1, createdAt: -1 } },
    { key: { 'geo.countryCode': 1, createdAt: -1 } },
  ])

  await database.command({ ping: 1 })
  return true
}

export async function checkDatabase() {
  if (!dbEnabled || !database) return 'disabled'
  try {
    await database.command({ ping: 1 })
    return 'ok'
  } catch (err) {
    console.error('MongoDB health check failed:', err.message)
    return 'error'
  }
}

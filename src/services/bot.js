const BOT_UA = /bot|spider|crawler|ahrefs|petal|bytespider|bingpreview|facebookexternalhit|slurp|duckduckbot|yandex|semrush|dotbot|mj12bot|headless/i

function unquote(value) {
  return String(value || '').replace(/^["']|["']$/g, '')
}

function signals(visitor) {
  return [
    unquote(visitor?.clientHints?.platform),
    unquote(visitor?.client?.platform),
    String(visitor?.userAgent || ''),
  ]
}

export function isLinuxClient(visitor) {
  const values = signals(visitor)
  if (values.some((value) => /android/i.test(value))) return false
  return values.some((value) => /linux/i.test(value))
}

export function isBot(visitor) {
  if (BOT_UA.test(String(visitor?.userAgent || ''))) return true
  return isLinuxClient(visitor)
}

const notAndroid = {
  $and: [
    { userAgent: { $not: /android/i } },
    { 'client.platform': { $not: /android/i } },
    { 'clientHints.platform': { $not: /android/i } },
  ],
}

export const botMatch = {
  $or: [
    { userAgent: BOT_UA },
    {
      $and: [
        notAndroid,
        {
          $or: [
            { userAgent: /linux/i },
            { 'client.platform': /linux/i },
            { 'clientHints.platform': /linux/i },
          ],
        },
      ],
    },
  ],
}

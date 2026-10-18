// Fails fast, with a readable message, when a target is down. Runs once before any test.
const { CONSUMER_URL, RESTO_URL } = require('./support/env')

async function ping(name, url) {
  let last = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url + '/', { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
      if (res.status === 200) return null
      last = `HTTP ${res.status}`
    } catch (err) {
      last = err.cause?.code || err.name || err.message
    }
  }
  return `  - ${name} ${url} -> ${last} (expected HTTP 200)`
}

module.exports = async () => {
  const problems = (await Promise.all([
    ping('CONSUMER_URL', CONSUMER_URL),
    ping('RESTO_URL', RESTO_URL),
  ])).filter(Boolean)
  if (problems.length) {
    throw new Error(
      `\n\nRufesto e2e: target(s) not reachable, aborting before any test runs:\n${problems.join('\n')}\n\n` +
      'Check the stack is up (and Cloudflare Tunnel), or point CONSUMER_URL / RESTO_URL at another host.\n',
    )
  }
  console.log(`Rufesto e2e targets OK\n  consumer: ${CONSUMER_URL}\n  resto:    ${RESTO_URL}`)
}

import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'lxn44moi',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

if (!process.env.SANITY_API_TOKEN) {
  console.error('Missing SANITY_API_TOKEN')
  process.exit(1)
}

const INSTRUCTION =
  'Before starting any task, use the search_skills tool to find relevant skills. ' +
  'If a skill applies, follow its steps and reflect that in your output. ' +
  'If you are unsure which tools are available, call list_available_tools.'

const docs = await client.fetch(
  `*[_type == "agent" && defined(backstory)]{_id, backstory}`
)

console.log(`Found ${docs.length} agents`)

for (const doc of docs) {
  if (doc.backstory.includes(INSTRUCTION)) {
    continue
  }

  const nextBackstory = `${INSTRUCTION}\n\n${doc.backstory}`
  await client.patch(doc._id).set({backstory: nextBackstory}).commit()
  console.log(`Updated ${doc._id}`)
}

console.log('Backstory update complete')

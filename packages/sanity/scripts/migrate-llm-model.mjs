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

const DEFAULT_MODEL = 'gpt-5.2'

const docs = await client.fetch(
  `*[_type == "agent" && (defined(llmTier) || !defined(llmModel))]{_id, llmTier, llmModel}`
)

console.log(`Found ${docs.length} agents needing migration`)

for (const doc of docs) {
  const nextModel = doc.llmModel || DEFAULT_MODEL
  await client
    .patch(doc._id)
    .set({llmModel: nextModel})
    .unset(['llmTier'])
    .commit()
  console.log(`Migrated ${doc._id} -> ${nextModel}`)
}

console.log('Migration complete')

#!/usr/bin/env node
/**
 * One-time migration: set implementationType = "builtin" on all existing
 * tool documents that don't have it yet.
 *
 * Usage:
 *   SANITY_API_TOKEN=<token> node packages/sanity/scripts/migrate-tool-impl-type.mjs
 */

import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'lxn44moi',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function migrate() {
  const tools = await client.fetch(
    `*[_type == "tool" && !defined(implementationType)]{ _id, name }`
  )

  if (tools.length === 0) {
    console.log('✅ All tool documents already have implementationType set.')
    return
  }

  console.log(`Found ${tools.length} tool(s) without implementationType:\n`)

  const tx = client.transaction()
  for (const t of tools) {
    console.log(`  → ${t.name} (${t._id})`)
    tx.patch(t._id, (p) => p.set({implementationType: 'builtin'}))
  }

  await tx.commit()
  console.log(`\n✅ Migrated ${tools.length} tool(s) to implementationType: "builtin"`)
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})

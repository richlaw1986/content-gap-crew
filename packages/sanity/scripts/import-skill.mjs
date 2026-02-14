#!/usr/bin/env node
/**
 * Import a multi-file skill into Sanity.
 *
 * Usage:
 *   # From a local folder (e.g. downloaded from Slack)
 *   node scripts/import-skill.mjs ~/Downloads/messaging-framework/
 *
 *   # From a GitHub URL
 *   node scripts/import-skill.mjs https://github.com/user/repo/tree/main/skills/my-skill
 *
 * Expected folder structure:
 *   my-skill/
 *   ├── SKILL.md              ← main playbook (required)
 *   └── references/           ← optional supporting files
 *       ├── brandscript.md
 *       ├── personas.md
 *       └── competitive-positioning.md
 *
 * The script will:
 *  1. Read SKILL.md and parse its YAML frontmatter (name, description, tags)
 *  2. Read all .md files under references/
 *  3. Create a Sanity "skill" document with structured fields + playbook + references
 *
 * Environment:
 *   SANITY_API_TOKEN  — required (write token)
 */

import {createClient} from '@sanity/client'
import {readFileSync, readdirSync, existsSync, statSync} from 'fs'
import {join, basename, resolve} from 'path'

// ── Sanity client ──────────────────────────────────────────────

const client = createClient({
  projectId: 'lxn44moi',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

if (!process.env.SANITY_API_TOKEN) {
  console.error('❌  Missing SANITY_API_TOKEN environment variable.')
  console.error('   Export it before running: export SANITY_API_TOKEN=sk...')
  process.exit(1)
}

// ── Parse arguments ────────────────────────────────────────────

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/import-skill.mjs <folder-path | github-url>')
  console.error('')
  console.error('Examples:')
  console.error('  node scripts/import-skill.mjs ~/Downloads/messaging-framework/')
  console.error('  node scripts/import-skill.mjs https://github.com/user/repo/tree/main/skills/my-skill')
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────────

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm = match[1]
  const result = {}

  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '')

  const descMatch = fm.match(/^description:\s*(.+)$/m)
  if (descMatch) result.description = descMatch[1].trim().replace(/^["']|["']$/g, '')

  const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m)
  if (tagsMatch) {
    result.tags = tagsMatch[1]
      .split(',')
      .map((t) => t.trim().replace(/['"]/g, ''))
      .filter(Boolean)
  }

  return result
}

function extractSteps(md) {
  const stepsSection = md.match(/##\s*(?:Steps|How|Procedure|Process)\b[\s\S]*?(?=\n##|\n---|$)/i)
  if (!stepsSection) return []
  const bullets = stepsSection[0].match(/^(?:\d+\.|[-*])\s+(.+)$/gm)
  if (!bullets) return []
  return bullets.map((b) => b.replace(/^(?:\d+\.|[-*])\s+/, '').trim())
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Read from local folder ─────────────────────────────────────

async function importFromFolder(folderPath) {
  const absPath = resolve(folderPath)

  if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
    console.error(`❌  Not a valid directory: ${absPath}`)
    process.exit(1)
  }

  // Find SKILL.md (case-insensitive)
  const files = readdirSync(absPath)
  const skillFile = files.find((f) => f.toLowerCase() === 'skill.md')

  if (!skillFile) {
    console.error(`❌  No SKILL.md found in ${absPath}`)
    console.error('   Expected folder structure:')
    console.error('     my-skill/')
    console.error('     ├── SKILL.md')
    console.error('     └── references/')
    console.error('         ├── brandscript.md')
    console.error('         └── ...')
    process.exit(1)
  }

  const skillMd = readFileSync(join(absPath, skillFile), 'utf-8')

  // Read reference files
  const references = []
  const refsDir = join(absPath, 'references')
  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    const refFiles = readdirSync(refsDir).filter((f) => f.endsWith('.md'))
    for (const refFile of refFiles) {
      const content = readFileSync(join(refsDir, refFile), 'utf-8')
      references.push({
        name: refFile.replace(/\.md$/i, ''),
        content: content.slice(0, 8000),
      })
    }
  }

  return {skillMd, references, folderName: basename(absPath)}
}

// ── Read from GitHub URL ───────────────────────────────────────

async function importFromGitHub(url) {
  // Parse: https://github.com/user/repo/tree/branch/path/to/skill
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/
  )
  if (!match) {
    console.error(`❌  Could not parse GitHub URL: ${url}`)
    console.error('   Expected format: https://github.com/user/repo/tree/branch/path/to/skill')
    process.exit(1)
  }

  const [, owner, repo, branch, skillPath] = match
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`

  console.log(`📡  Fetching from: ${rawBase}/SKILL.md`)

  const skillResp = await fetch(`${rawBase}/SKILL.md`)
  if (!skillResp.ok) {
    console.error(`❌  Could not fetch SKILL.md (HTTP ${skillResp.status})`)
    process.exit(1)
  }
  const skillMd = await skillResp.text()

  // Discover reference files from links in SKILL.md
  const refLinks = [...skillMd.matchAll(/\[([^\]]*)\]\(references\/([^)]+\.md)\)/gi)]
  const references = []

  for (const [, , refFile] of refLinks) {
    const refUrl = `${rawBase}/references/${refFile}`
    console.log(`📡  Fetching reference: ${refFile}`)
    try {
      const refResp = await fetch(refUrl)
      if (refResp.ok) {
        const content = await refResp.text()
        references.push({
          name: refFile.replace(/\.md$/i, ''),
          content: content.slice(0, 8000),
        })
      } else {
        console.warn(`   ⚠️  Could not fetch ${refFile} (HTTP ${refResp.status})`)
      }
    } catch (e) {
      console.warn(`   ⚠️  Failed to fetch ${refFile}: ${e.message}`)
    }
  }

  const folderName = skillPath.split('/').pop() || 'imported-skill'
  return {skillMd, references, folderName}
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const isUrl = input.startsWith('http://') || input.startsWith('https://')

  console.log(`\n🔧  Importing skill from ${isUrl ? 'GitHub' : 'local folder'}...\n`)

  const {skillMd, references, folderName} = isUrl
    ? await importFromGitHub(input)
    : await importFromFolder(input)

  // Parse SKILL.md
  const frontmatter = parseFrontmatter(skillMd)
  const steps = extractSteps(skillMd)
  const name = frontmatter.name || folderName
  const description = frontmatter.description || ''
  const tags = frontmatter.tags || [slugify(name)]

  // Build Sanity document
  const docId = `skill-imported-${slugify(name)}`

  const doc = {
    _id: docId,
    _type: 'skill',
    name,
    description,
    steps: steps.length ? steps : undefined,
    tags,
    source: 'local',
    playbook: skillMd.slice(0, 8000),
    enabled: true,
  }

  if (references.length) {
    doc.references = references.map((r, i) => ({
      _key: `ref-${i}`,
      name: r.name,
      content: r.content,
    }))
  }

  // Upsert into Sanity
  console.log(`📝  Skill: "${name}"`)
  console.log(`   Description: ${description.slice(0, 100) || '(none)'}`)
  console.log(`   Steps: ${steps.length || 0}`)
  console.log(`   Tags: ${tags.join(', ')}`)
  console.log(`   References: ${references.length} file(s)`)
  if (references.length) {
    for (const r of references) {
      console.log(`     • ${r.name} (${r.content.length.toLocaleString()} chars)`)
    }
  }
  console.log(`   Document ID: ${docId}`)
  console.log()

  try {
    await client.createOrReplace(doc)
    console.log(`✅  Skill "${name}" imported successfully!`)
    console.log(`   View in Studio → Agent Config → Skills`)
  } catch (err) {
    console.error(`❌  Failed to import: ${err.message}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`)
  process.exit(1)
})

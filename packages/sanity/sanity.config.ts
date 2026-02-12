import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemas'

export default defineConfig({
  name: 'content-gap-crew',
  title: 'Agent Studio',

  // TODO: Replace with actual project ID and dataset
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'lxn44moi',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    structureTool(),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})

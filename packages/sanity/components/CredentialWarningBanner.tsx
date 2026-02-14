/**
 * CredentialWarningBanner — shows a warning banner on credential documents
 * when the "Direct Value" storage method is selected.
 *
 * Used as a `components.input` on a hidden-by-default string field.
 * The field itself stores nothing — it's purely a visual warning.
 */

import {type StringInputProps, useFormValue} from 'sanity'
import {Card, Flex, Stack, Text} from '@sanity/ui'

export function CredentialWarningBanner(_props: StringInputProps) {
  const storageMethod = useFormValue(['storageMethod']) as string | undefined

  if (storageMethod !== 'direct') return null

  return (
    <Card
      tone="caution"
      padding={3}
      radius={2}
      shadow={1}
      style={{marginBottom: 8}}
    >
      <Flex align="flex-start" gap={3}>
        <Text size={2} style={{lineHeight: 1}}>
          ⚠️
        </Text>
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Direct values are stored in the Sanity Content Lake
          </Text>
          <Text size={1} muted>
            For production, use <strong>Environment Variable</strong> mode — store the actual secret
            in your server's <code>.env</code> file or a cloud secret manager, and enter only the env
            var name here (e.g. <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>).
          </Text>
        </Stack>
      </Flex>
    </Card>
  )
}

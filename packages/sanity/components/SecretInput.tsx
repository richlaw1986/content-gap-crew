/**
 * SecretInput — custom Sanity input component for credential fields.
 *
 * When storageMethod is "direct", the field shows as a password input (masked dots)
 * with a toggle to reveal the value. When storageMethod is "env", it renders as a
 * normal text input since the value is just an env var name, not a real secret.
 *
 * This is a UX improvement — it prevents casual shoulder-surfing in the Studio
 * and reminds editors that direct values are sensitive.
 */

import {useCallback, useState} from 'react'
import {type StringInputProps, set, unset, useFormValue} from 'sanity'
import {Box, Button, Flex, Stack, TextInput} from '@sanity/ui'

export function SecretInput(props: StringInputProps) {
  const {value, onChange, elementProps} = props
  const storageMethod = useFormValue(['storageMethod']) as string | undefined
  const isDirect = storageMethod === 'direct'
  const [revealed, setRevealed] = useState(false)

  const handleToggle = useCallback(() => {
    setRevealed((prev) => !prev)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.currentTarget.value
      onChange(next ? set(next) : unset())
    },
    [onChange],
  )

  // For env mode, just render the default input — it's only an env var name
  if (!isDirect) {
    return props.renderDefault(props)
  }

  // For direct mode, render a masked input with reveal toggle
  return (
    <Stack space={2}>
      <Flex align="center" gap={2}>
        <Box flex={1}>
          <TextInput
            {...elementProps}
            type={revealed ? 'text' : 'password'}
            value={value || ''}
            onChange={handleChange}
            autoComplete="off"
          />
        </Box>
        <Button
          mode="ghost"
          tone="default"
          text={revealed ? 'Hide' : 'Show'}
          onClick={handleToggle}
          style={{flexShrink: 0}}
          fontSize={1}
          padding={2}
        />
      </Flex>
    </Stack>
  )
}

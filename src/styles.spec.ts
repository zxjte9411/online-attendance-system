/// <reference types="vite/client" />

// @ts-expect-error Node types are intentionally not configured in this project.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('styles.css', () => {
  it('does not contain legacy selectors', () => {
    for (const selector of ['.wordmark', '.wordmark-mark', '.google-button', '.google-mark', '.login-preview-state', '.skip-link']) {
      expect(styles).not.toContain(selector)
    }
  })
})

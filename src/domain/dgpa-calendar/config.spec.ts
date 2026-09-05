import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DGPA_METADATA_URL,
  isLocalOrTestEnvironment,
  resolveDgpaMetadataUrl,
} from './config'

describe('DGPA Environment & Metadata URL Resolution (config.ts)', () => {
  const TEST_FIXTURE_URL = 'http://host.docker.internal:54329/api/v2/rest/dataset/14718'

  describe('isLocalOrTestEnvironment', () => {
    it('recognizes local Supabase Kong URL as local/test', () => {
      expect(isLocalOrTestEnvironment({ supabaseUrl: 'http://kong:8000' })).toBe(true)
    })

    it('recognizes localhost and 127.0.0.1 as local/test', () => {
      expect(isLocalOrTestEnvironment({ supabaseUrl: 'http://localhost:54321' })).toBe(true)
      expect(isLocalOrTestEnvironment({ supabaseUrl: 'http://127.0.0.1:54321' })).toBe(true)
    })

    it('recognizes host.docker.internal as local/test', () => {
      expect(isLocalOrTestEnvironment({ supabaseUrl: 'http://host.docker.internal:54321' })).toBe(true)
    })

    it('recognizes test and development environments', () => {
      expect(isLocalOrTestEnvironment({ environment: 'test' })).toBe(true)
      expect(isLocalOrTestEnvironment({ denoEnv: 'development' })).toBe(true)
      expect(isLocalOrTestEnvironment({ appEnv: 'local' })).toBe(true)
    })

    it('rejects production environment regardless of other flags', () => {
      expect(
        isLocalOrTestEnvironment({
          environment: 'production',
          supabaseUrl: 'http://localhost:54321',
        })
      ).toBe(false)
      expect(
        isLocalOrTestEnvironment({
          denoEnv: 'production',
          allowTestOverride: 'true',
        })
      ).toBe(false)
    })

    it('rejects remote Supabase Cloud domain (*.supabase.co)', () => {
      expect(
        isLocalOrTestEnvironment({
          supabaseUrl: 'https://my-prod-project.supabase.co',
        })
      ).toBe(false)
    })
  })

  describe('resolveDgpaMetadataUrl', () => {
    it('returns official default URL when no override is provided', () => {
      const res = resolveDgpaMetadataUrl({ supabaseUrl: 'http://kong:8000' })
      expect(res.url).toBe(DEFAULT_DGPA_METADATA_URL)
      expect(res.overridden).toBe(false)
      expect(res.rejected).toBe(false)
    })

    it('accepts fixture override in verified local/test execution context', () => {
      const res = resolveDgpaMetadataUrl({
        dgpaMetadataUrl: TEST_FIXTURE_URL,
        supabaseUrl: 'http://kong:8000',
      })
      expect(res.url).toBe(TEST_FIXTURE_URL)
      expect(res.overridden).toBe(true)
      expect(res.rejected).toBe(false)
      expect(res.isLocalOrTest).toBe(true)
    })

    it('fails closed in production: rejects fixture override and forces official endpoint', () => {
      const res = resolveDgpaMetadataUrl({
        dgpaMetadataUrl: TEST_FIXTURE_URL,
        supabaseUrl: 'https://my-prod-project.supabase.co',
      })
      expect(res.url).toBe(DEFAULT_DGPA_METADATA_URL)
      expect(res.overridden).toBe(false)
      expect(res.rejected).toBe(true)
      expect(res.isLocalOrTest).toBe(false)
      expect(res.reason).toContain('Security boundary violation')
    })

    it('fails closed when ENVIRONMENT=production even if pointing to local IP', () => {
      const res = resolveDgpaMetadataUrl({
        dgpaMetadataUrl: TEST_FIXTURE_URL,
        supabaseUrl: 'http://localhost:54321',
        environment: 'production',
      })
      expect(res.url).toBe(DEFAULT_DGPA_METADATA_URL)
      expect(res.rejected).toBe(true)
      expect(res.overridden).toBe(false)
    })

    it('handles empty string or whitespace override cleanly', () => {
      const res = resolveDgpaMetadataUrl({
        dgpaMetadataUrl: '   ',
        supabaseUrl: 'http://kong:8000',
      })
      expect(res.url).toBe(DEFAULT_DGPA_METADATA_URL)
      expect(res.overridden).toBe(false)
      expect(res.rejected).toBe(false)
    })
  })
})

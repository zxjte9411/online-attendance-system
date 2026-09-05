export const DEFAULT_DGPA_METADATA_URL = 'https://data.gov.tw/api/v2/rest/dataset/14718'

export interface DgpaEnvironmentConfig {
  dgpaMetadataUrl?: string | null
  supabaseUrl?: string | null
  environment?: string | null
  denoEnv?: string | null
  appEnv?: string | null
  allowTestOverride?: string | null
}

export interface ResolvedDgpaMetadataUrl {
  url: string
  overridden: boolean
  rejected: boolean
  isLocalOrTest: boolean
  reason: string
}

export function isLocalOrTestEnvironment(env: DgpaEnvironmentConfig): boolean {
  const envName = (env.environment || env.denoEnv || env.appEnv || '').trim().toLowerCase()
  // Explicit production indicators disqualify immediately
  if (envName === 'production' || envName === 'prod') {
    return false
  }

  const supabaseUrl = (env.supabaseUrl || '').trim().toLowerCase()
  // Supabase Cloud URLs (*.supabase.co, *.supabase.net) are production/staging backends
  if (supabaseUrl.includes('.supabase.co') || supabaseUrl.includes('.supabase.net')) {
    return false
  }

  // Explicit local/test env indicators
  if (
    envName === 'test' ||
    envName === 'local' ||
    envName === 'development' ||
    envName === 'dev' ||
    env.allowTestOverride === 'true'
  ) {
    return true
  }

  // Known local Supabase host patterns
  if (
    supabaseUrl.startsWith('http://kong:') ||
    supabaseUrl.startsWith('http://localhost:') ||
    supabaseUrl.startsWith('http://127.0.0.1:') ||
    supabaseUrl.startsWith('http://host.docker.internal:')
  ) {
    return true
  }

  return false
}

export function resolveDgpaMetadataUrl(env: DgpaEnvironmentConfig): ResolvedDgpaMetadataUrl {
  const overrideUrl = env.dgpaMetadataUrl?.trim()
  if (!overrideUrl) {
    return {
      url: DEFAULT_DGPA_METADATA_URL,
      overridden: false,
      rejected: false,
      isLocalOrTest: isLocalOrTestEnvironment(env),
      reason: 'No DGPA_METADATA_URL override provided; using official endpoint.',
    }
  }

  const isLocalOrTest = isLocalOrTestEnvironment(env)
  if (isLocalOrTest) {
    return {
      url: overrideUrl,
      overridden: true,
      rejected: false,
      isLocalOrTest: true,
      reason: `Authorized local/test override accepted: ${overrideUrl}`,
    }
  }

  // Production-like context: Fail-closed.
  // Never route production execution to test fixture URL.
  return {
    url: DEFAULT_DGPA_METADATA_URL,
    overridden: false,
    rejected: true,
    isLocalOrTest: false,
    reason: `Security boundary violation: DGPA_METADATA_URL override (${overrideUrl}) is rejected in production-like environment; forced official endpoint.`,
  }
}

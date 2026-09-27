// Which build is installed: "Vommeal 0.1.0 · Build 27.09.2026 14:32 · a1b2c3d".
// The values are baked into the JavaScript bundle at build time (next.config.js),
// so after an update the page shows the new build as soon as it loads.

const REPO = 'https://github.com/killlian24/vommeal'

export function buildInfo() {
  return {
    version: process.env.NEXT_PUBLIC_APP_VERSION || '',
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || '',
    commit: process.env.NEXT_PUBLIC_COMMIT || '',
  }
}

/** "27.09.2026 14:32" in the given time zone (the server's), '' when unknown. */
export function formatBuildTime(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  let text: string
  try { text = new Intl.DateTimeFormat('de-DE', { ...opts, timeZone }).format(d) } catch { text = new Intl.DateTimeFormat('de-DE', opts).format(d) }
  return text.replace(',', '')
}

export function VersionInfo({ timeZone, className = '' }: { timeZone?: string; className?: string }) {
  const { version, buildTime, commit } = buildInfo()
  const when = formatBuildTime(buildTime, timeZone)
  const short = commit.slice(0, 7)
  const linkable = /^[0-9a-f]{7,40}$/i.test(commit)
  return (
    <p className={`text-xs text-[#8f8f8f] ${className}`}>
      Vommeal {version || 'unbekannte Version'}
      {when && <> · Build {when}</>}
      {short && (
        <>
          {' · '}
          {linkable ? (
            <a href={`${REPO}/commit/${commit}`} target="_blank" rel="noopener noreferrer"
              className="font-mono underline decoration-[#444] underline-offset-2 hover:text-white">{short}</a>
          ) : <span className="font-mono">{short}</span>}
        </>
      )}
    </p>
  )
}

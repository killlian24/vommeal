import { describe, expect, it } from 'vitest'
import { sanitizeUrl } from '../lib/config'

describe('sanitizeUrl', () => {
  it('keeps an explicit scheme', () => {
    expect(sanitizeUrl('http://192.168.0.124:9925/')).toBe('http://192.168.0.124:9925')
    expect(sanitizeUrl('https://mealie.example.com')).toBe('https://mealie.example.com')
  })
  it('defaults LAN and Tailscale hosts to http', () => {
    expect(sanitizeUrl('192.168.0.124:9925')).toBe('http://192.168.0.124:9925')
    expect(sanitizeUrl('10.0.0.5:8123')).toBe('http://10.0.0.5:8123')
    expect(sanitizeUrl('172.20.0.3')).toBe('http://172.20.0.3')
    expect(sanitizeUrl('100.101.102.103:8123')).toBe('http://100.101.102.103:8123')
    expect(sanitizeUrl('homeassistant.local:8123')).toBe('http://homeassistant.local:8123')
    expect(sanitizeUrl('localhost:3000')).toBe('http://localhost:3000')
  })
  it('defaults public hosts to https', () => {
    expect(sanitizeUrl('mealie.vomstorage.synology.me')).toBe('https://mealie.vomstorage.synology.me')
    expect(sanitizeUrl('nas.tail489a9.ts.net:9925')).toBe('https://nas.tail489a9.ts.net:9925')
  })
  it('repairs a doubled scheme and trailing slashes', () => {
    expect(sanitizeUrl('https:https://mealie.example.com//')).toBe('https://mealie.example.com')
    expect(sanitizeUrl('   ')).toBe('')
  })
})

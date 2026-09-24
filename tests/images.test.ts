import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-images-'))
process.env.DATA_DIR = tmpDir

const { sniffImageType, resolveImageSource, IMAGE_CACHE_DIR } = await import('../lib/images')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('image proxy helpers', () => {
  it('caches under DATA_DIR/cache/images', () => {
    expect(IMAGE_CACHE_DIR).toBe(path.join(tmpDir, 'cache', 'images'))
  })

  it('detects image types from magic bytes', () => {
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe('image/webp')
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffImageType(Buffer.from('GIF89a...'))).toBe('image/gif')
    expect(sniffImageType(Buffer.from('<!DOCTYPE html><html>'))).toBeNull()
  })

  it('points stored Mealie media URLs at the current Mealie address', () => {
    const stored = 'http://192.168.0.5:9000/api/media/recipes/abc/images/original.webp'
    expect(resolveImageSource(stored, 'http://192.168.0.124:9925'))
      .toBe('http://192.168.0.124:9925/api/media/recipes/abc/images/original.webp')
    expect(resolveImageSource('https://example.com/pic.jpg', 'http://192.168.0.124:9925')).toBe('https://example.com/pic.jpg')
    expect(resolveImageSource(stored, null)).toBe(stored)
  })
})

import { getSetting } from './db'
import {
  categorizeWithRules,
  sanitizeCustomCategoryKeywords,
} from './categoryRules'
import type { CategoryKeywordMap } from './categoryRules'

function customCategoryKeywords(): CategoryKeywordMap {
  const raw = getSetting('custom_category_keywords')
  if (!raw) return {}
  try {
    return sanitizeCustomCategoryKeywords(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function categorize(name: string): string {
  return categorizeWithRules(name, customCategoryKeywords())
}

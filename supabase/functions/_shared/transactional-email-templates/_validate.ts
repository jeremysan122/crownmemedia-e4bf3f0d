/// <reference types="npm:@types/react@18.3.1" />
import { z } from 'npm:zod@3.25.76'

/**
 * Strict validation helpers for email template props.
 * Every template defines a Zod schema. The send pipeline runs `schema.parse`
 * which applies defaults and coerces values, so a missing/malformed field
 * can never break rendering.
 */

const MAX_STR = 500
const MAX_URL = 2000

export const safeString = (fallback = '') =>
  z
    .union([z.string(), z.number(), z.boolean()])
    .transform((v) => String(v).trim().slice(0, MAX_STR))
    .catch(fallback)
    .default(fallback)

export const safeOptionalString = () =>
  z
    .union([z.string(), z.number(), z.boolean()])
    .transform((v) => String(v).trim().slice(0, MAX_STR) || undefined)
    .optional()
    .catch(undefined)

export const safeUrl = (fallback = 'https://crownmemedia.com') =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => /^https?:\/\//i.test(v) && v.length <= MAX_URL, {
      message: 'invalid url',
    })
    .catch(fallback)
    .default(fallback)

export const safeOptionalUrl = () =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => /^https?:\/\//i.test(v) && v.length <= MAX_URL, {
      message: 'invalid url',
    })
    .optional()
    .catch(undefined)

export const safeNumber = (fallback = 0) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseFloat(v)
      return Number.isFinite(n) ? n : fallback
    })
    .catch(fallback)
    .default(fallback)

export const safeOptionalNumber = () =>
  z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseFloat(v)
      return Number.isFinite(n) ? n : undefined
    })
    .optional()
    .catch(undefined)

export const safeBoolean = (fallback = false) =>
  z
    .union([z.boolean(), z.string(), z.number()])
    .transform((v) => {
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      return v === 'true' || v === '1'
    })
    .catch(fallback)
    .default(fallback)

/**
 * Safely parse template data. Always returns an object — never throws.
 */
export function safeParse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  try {
    return schema.parse(data ?? {})
  } catch {
    // Last-resort fallback: parse with empty object so all defaults kick in.
    return schema.parse({}) as z.infer<T>
  }
}

export { z }

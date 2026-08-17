import { describe, expect, it } from 'vitest'
import { parseQualification } from './qualify'

describe('parseQualification', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      niche: 'salon',
      matched_product: 'Salon Booking Management System',
      lead_score: 82,
      priority: 'HOT',
      pain_point: 'No online booking system detected',
      reason: 'Active salon with no booking widget',
    })
    const result = parseQualification(raw)
    expect(result).not.toBeNull()
    expect(result?.niche).toBe('salon')
    expect(result?.priority).toBe('HOT')
    expect(result?.lead_score).toBe(82)
  })

  it('strips markdown fences some models add despite instructions', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        niche: 'pharmacy_grocery_retail',
        matched_product: 'Billing Core',
        lead_score: 55,
        priority: 'WARM',
        pain_point: 'Manual billing',
        reason: 'No POS detected',
      }) +
      '\n```'
    const result = parseQualification(raw)
    expect(result).not.toBeNull()
    expect(result?.matched_product).toBe('Billing Core')
  })

  it('returns null for unparseable garbage instead of throwing', () => {
    expect(parseQualification('not json at all')).toBeNull()
    expect(parseQualification('')).toBeNull()
  })

  it('returns null when priority is outside the allowed enum', () => {
    const raw = JSON.stringify({
      niche: 'salon',
      matched_product: 'Salon Booking Management System',
      lead_score: 82,
      priority: 'SCORCHING', // not a real priority value
      pain_point: 'x',
      reason: 'x',
    })
    expect(parseQualification(raw)).toBeNull()
  })

  it('returns null when a required field is missing', () => {
    const raw = JSON.stringify({
      niche: 'salon',
      matched_product: 'Salon Booking Management System',
      // lead_score omitted
      priority: 'HOT',
      pain_point: 'x',
      reason: 'x',
    })
    expect(parseQualification(raw)).toBeNull()
  })
})
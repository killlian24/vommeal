import { NextResponse } from 'next/server'
import { testMealieConnection } from '@/lib/mealie'

export async function GET() {
  const result = await testMealieConnection()
  return NextResponse.json(result)
}

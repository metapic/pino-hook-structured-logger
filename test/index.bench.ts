import pino from 'pino'
import { bench, describe, vi } from 'vitest'

import { structuredLogger } from '../src'

const standardPino = pino(
  {},
  {
    write: vi.fn(),
  },
)

const structuredPino = pino(
  {
    hooks: structuredLogger(),
  },
  {
    write: vi.fn(),
  },
)

describe('info with params', () => {
  bench(
    'standard logger',
    () =>
      standardPino.info(
        {
          id: 12345,
          location: 'Salzburg',
        },
        'User %d logged in from %s',
        12345,
        'Salzburg',
      ),
    { time: 1000 },
  )

  bench(
    'structured logger',
    () =>
      structuredPino.info(
        {
          id: 12345,
          location: 'Salzburg',
        },
        'User {id} logged in from {location}',
      ),
    { time: 1000 },
  )
})

describe('info with message only', () => {
  bench('standard logger', () => standardPino.info('hello world'), {
    time: 1000,
  })
  bench('structured logger', () => structuredPino.info('hello world'), {
    time: 1000,
  })
})

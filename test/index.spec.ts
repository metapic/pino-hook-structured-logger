import pino from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { structuredLogger } from '../src'

describe('structured logger', () => {
  let mockStream: pino.DestinationStream
  let logger: pino.Logger
  let capturedLogs: Record<string, unknown>[]

  beforeEach(() => {
    capturedLogs = []
    mockStream = {
      write: vi.fn((line: string) => {
        capturedLogs.push(JSON.parse(line) as Record<string, unknown>)
      }),
    }

    logger = pino(
      {
        level: 'debug',
        hooks: structuredLogger(),
      },
      mockStream,
    )
  })

  describe('configuration', () => {
    it('uses custom message template key', () => {
      const customLogger = pino(
        {
          level: 'debug',
          hooks: structuredLogger({ messageTemplateKey: 'template' }),
        },
        mockStream,
      )

      customLogger.info('Hello {name}', { name: 'World' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Hello World')
      expect(capturedLogs[0].template).toBe('Hello {name}')
      expect(capturedLogs[0].extra).toEqual({ name: 'World' })
    })

    it('uses custom structured data key', () => {
      const customLogger = pino(
        {
          level: 'debug',
          hooks: structuredLogger({ structuredDataKey: 'data' }),
        },
        mockStream,
      )

      customLogger.info('Hello {name}', { name: 'World' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Hello World')
      expect(capturedLogs[0].msg_tpl).toBe('Hello {name}')
      expect(capturedLogs[0].data).toEqual({ name: 'World' })
    })

    it('handles different log levels', () => {
      logger.debug('Debug {message}', { message: 'test' })
      logger.warn('Warning {code}', { code: '404' })
      logger.error('Error {type}', { type: 'validation' })

      expect(capturedLogs).toHaveLength(3)
      expect(capturedLogs[0].level).toBe(20)
      expect(capturedLogs[1].level).toBe(40)
      expect(capturedLogs[2].level).toBe(50)
    })

    it('does not log when level is below configured threshold', () => {
      const customLogger = pino(
        {
          level: 'warn',
          hooks: structuredLogger({ messageTemplateKey: 'template' }),
        },
        mockStream,
      )

      customLogger.info('Simple message')

      expect(capturedLogs).toHaveLength(0)
    })
  })

  describe('supports log format', () => {
    it.each([
      () =>
        logger.info(
          {
            user_id: 12345,
            location: 'Salzburg',
          },
          'User {user_id} logged in from {location}',
        ),
      () =>
        logger.info('User {user_id} logged in from {location}', {
          user_id: 12345,
          location: 'Salzburg',
        }),
      () =>
        logger.info(
          { user_id: 12345 },
          'User {user_id} logged in from {location}',
          { location: 'Salzburg' },
        ),
    ])('%s', (log) => {
      log()

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('User 12345 logged in from Salzburg')
      expect(capturedLogs[0].msg_tpl).toBe(
        'User {user_id} logged in from {location}',
      )
      expect(capturedLogs[0].extra).toEqual({
        user_id: 12345,
        location: 'Salzburg',
      })
    })
  })

  it('handles missing template parameters', () => {
    logger.info('User {user_id} logged in from {location}', {
      user_id: 12345,
      // location is missing
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in from {location}')
    expect(capturedLogs[0].msg_tpl).toBe(
      'User {user_id} logged in from {location}',
    )
    expect(capturedLogs[0].extra).toEqual({
      user_id: 12345,
    })
  })

  it('handles empty template parameters', () => {
    logger.info('Message with {empty}', { empty: '' })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Message with ')
    expect(capturedLogs[0].msg_tpl).toBe('Message with {empty}')
  })

  it('handles numeric template parameters', () => {
    logger.info('Count: {count}, Price: {price}', {
      count: 42,
      price: 19.99,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Count: 42, Price: 19.99')
  })

  it('includes the error object using the configured pino error key', () => {
    const error = new Error('This is an error')
    logger.error(error, 'An error occurred for user {user_id}', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('An error occurred for user 12345')
    expect(capturedLogs[0].msg_tpl).toBe('An error occurred for user {user_id}')
    expect(capturedLogs[0].extra).toEqual({
      user_id: 12345,
    })
    expect(capturedLogs[0].err).toEqual({
      message: 'This is an error',
      type: 'Error',
      stack: expect.any(String) as unknown,
    })
  })

  it('merges the pino "nested object" into the structured data', () => {
    const obj = { foo: 'bar', bar: { hello: 'world' } }
    logger.info(obj, 'User {user_id} logged in', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].extra).toEqual({
      user_id: 12345,
      ...obj,
    })
  })

  it('structured data takes precedence of the pino "nested object"', () => {
    const obj = { foo: 'bar', user_id: 9999 }
    logger.info(obj, 'User {user_id} logged in', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].extra).toEqual({
      user_id: 12345,
      foo: 'bar',
    })
  })
})

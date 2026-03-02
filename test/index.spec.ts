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

      // @ts-expect-error This is a non-standard pino usage
      customLogger.info('Hello {name}', { name: 'World' }, 'arg1')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Hello World')
      expect(capturedLogs[0].template).toBe('Hello {name}')
      expect(capturedLogs[0].data).toEqual({ name: 'World' })
      expect(capturedLogs[0].args).toEqual(['arg1'])
    })

    it('uses custom structured data key', () => {
      const customLogger = pino(
        {
          level: 'debug',
          hooks: structuredLogger({ dataKey: 'extra' }),
        },
        mockStream,
      )

      // @ts-expect-error This is a non-standard pino usage
      customLogger.info('Hello {name}', { name: 'World' }, 'arg1')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Hello World')
      expect(capturedLogs[0].msg_tpl).toBe('Hello {name}')
      expect(capturedLogs[0].extra).toEqual({ name: 'World' })
      expect(capturedLogs[0].args).toEqual(['arg1'])
    })

    it('uses custom args data key', () => {
      const customLogger = pino(
        {
          level: 'debug',
          hooks: structuredLogger({ argsKey: 'params' }),
        },
        mockStream,
      )

      // @ts-expect-error This is a non-standard pino usage
      customLogger.info('Hello {name}', { name: 'World' }, 'arg1')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Hello World')
      expect(capturedLogs[0].msg_tpl).toBe('Hello {name}')
      expect(capturedLogs[0].data).toEqual({ name: 'World' })
      expect(capturedLogs[0].params).toEqual(['arg1'])
    })

    it('respects pino configured error key', () => {
      const customLogger = pino(
        {
          errorKey: 'pinoError',
          hooks: structuredLogger(),
        },
        mockStream,
      )

      const error = new Error('Test error')
      customLogger.error(error, 'An error occurred')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].err).toBeUndefined()
      expect(capturedLogs[0].pinoError).toEqual({
        message: 'Test error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
    })

    it('does not log when level is below configured threshold', () => {
      const customLogger = pino(
        {
          level: 'warn',
          hooks: structuredLogger(),
        },
        mockStream,
      )

      customLogger.info('Simple message')

      expect(capturedLogs).toHaveLength(0)
    })
  })

  describe('log formats', () => {
    it.each([
      () =>
        logger.info(
          {
            user_id: 12345,
            location: 'Salzburg',
          },
          'User {user_id} logged in from {location}',
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger.info(
          'User {user_id} logged in from {location}',
          // @ts-expect-error This is a non-standard pino usage
          {
            user_id: 12345,
            location: 'Salzburg',
          },
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger.info(
          { user_id: 12345 },
          'User {user_id} logged in from {location}',
          { location: 'Salzburg' },
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger.info(
          'User {user_id} logged in from {location}',
          // @ts-expect-error This is a non-standard pino usage
          12345,
          'Salzburg',
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger.info(
          { user_id: 12345 },
          'User {user_id} logged in from {location}',
          'Salzburg',
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger.info(
          'User {user_id} logged in from {location}',
          // @ts-expect-error This is a non-standard pino usage
          { location: 'Salzburg' },
          12345,
          'arg1',
          { arg_num: 2 },
        ),
      () =>
        logger
          .child({ location: 'Salzburg' })
          // @ts-expect-error This is a non-standard pino usage
          .info('User {user_id} logged in from {location}', 12345, 'arg1', {
            arg_num: 2,
          }),

      () =>
        logger
          .child({ location: 'Salzburg' })
          .child({ user_id: 12345 })
          // @ts-expect-error This is a non-standard pino usage
          .info('User {user_id} logged in from {location}', 'arg1', {
            arg_num: 2,
          }),
      () =>
        logger
          .child({ location: 'Salzburg', user_id: 12345 })
          // @ts-expect-error This is a non-standard pino usage
          .info('User {user_id} logged in from {location}', 'arg1', {
            arg_num: 2,
          }),
    ])('%s', (log) => {
      log()

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('User 12345 logged in from Salzburg')
      expect(capturedLogs[0].msg_tpl).toBe(
        'User {user_id} logged in from {location}',
      )
      expect(capturedLogs[0].data).toEqual({
        user_id: 12345,
        location: 'Salzburg',
      })
      expect(capturedLogs[0].args).toEqual(['arg1', { arg_num: 2 }])
    })
  })

  it('handles missing template parameters', () => {
    // @ts-expect-error This is a non-standard pino usage
    logger.info('User {user_id} logged in from {location}', {
      user_id: 12345,
      // location is missing
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in from {location}')
    expect(capturedLogs[0].msg_tpl).toBe(
      'User {user_id} logged in from {location}',
    )
    expect(capturedLogs[0].data).toEqual({
      user_id: 12345,
    })
  })

  it('handles empty template parameters', () => {
    // @ts-expect-error This is a non-standard pino usage
    logger.info('Message with {empty}', { empty: '' })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Message with ')
    expect(capturedLogs[0].msg_tpl).toBe('Message with {empty}')
  })

  it('handles numeric template parameters', () => {
    // @ts-expect-error This is a non-standard pino usage
    logger.info('Count: {count}, Price: {price}', {
      count: 42,
      price: 19.99,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Count: 42, Price: 19.99')
  })

  it('does not add structured data property if there is no data', () => {
    logger.info('Just a simple log message')

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Just a simple log message')
    expect(capturedLogs[0].msg_tpl).toBe('Just a simple log message')
    expect(capturedLogs[0].data).toBeUndefined()
  })

  it('does not add structured data property if there is no data after unwrapping', () => {
    const customLogger = pino(
      {
        hooks: structuredLogger({
          unwrapKeys: ['ctx', 'bar'],
        }),
      },
      mockStream,
    )

    customLogger
      .child({ ctx: 'test123' })
      // @ts-expect-error This is a non-standard pino usage
      .info('Just a simple log message with {bar}', 12345)

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('Just a simple log message with 12345')
    expect(capturedLogs[0].msg_tpl).toBe('Just a simple log message with {bar}')
    expect(capturedLogs[0].data).toBeUndefined()
    expect(capturedLogs[0].ctx).toBe('test123')
    expect(capturedLogs[0].bar).toBe(12345)
  })

  describe('error handling', () => {
    it('includes the error object using the configured pino error key', () => {
      const error = new Error('This is an error')
      logger.error(error, 'An error occurred for user {user_id}', {
        user_id: 12345,
      })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('An error occurred for user 12345')
      expect(capturedLogs[0].msg_tpl).toBe(
        'An error occurred for user {user_id}',
      )
      expect(capturedLogs[0].data).toEqual({
        user_id: 12345,
      })
      expect(capturedLogs[0].err).toEqual({
        message: 'This is an error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
    })

    it('unwraps the error object when passed as mergingObject', () => {
      const error = new Error('This is an error')
      logger.error({ err: error }, 'An error occurred for user {user_id}', {
        user_id: 12345,
      })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('An error occurred for user 12345')
      expect(capturedLogs[0].msg_tpl).toBe(
        'An error occurred for user {user_id}',
      )
      expect(capturedLogs[0].data).toEqual({
        user_id: 12345,
      })
      expect(capturedLogs[0].err).toEqual({
        message: 'This is an error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
    })

    it('does not unwrap the error object when there is already an error', () => {
      const error = new Error('This is an error')
      logger.error(error, 'An error occurred for user {user_id}', {
        user_id: 12345,
        err: { message: 'Another error' },
      })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('An error occurred for user 12345')
      expect(capturedLogs[0].msg_tpl).toBe(
        'An error occurred for user {user_id}',
      )
      expect(capturedLogs[0].data).toEqual({
        user_id: 12345,
        err: { message: 'Another error' },
      })
      expect(capturedLogs[0].err).toEqual({
        message: 'This is an error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
    })
  })

  it('unwraps configured keys', () => {
    const customLogger = pino(
      {
        hooks: structuredLogger({ unwrapKeys: ['ctx', 'bar'] }),
      },
      mockStream,
    )

    customLogger.info(
      {
        user_id: 12345,
        ctx: 'test1',
        foo: 'bar',
        bar: { hello: 'world' },
      },
      'User {user_id} logged in',
    )

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].data).toEqual({
      user_id: 12345,
      foo: 'bar',
    })
    expect(capturedLogs[0].ctx).toBe('test1')
    expect(capturedLogs[0].bar).toEqual({ hello: 'world' })
  })

  it('merges the pino "nested object" into the structured data', () => {
    const obj = { foo: 'bar', bar: { hello: 'world' } }
    logger.info(obj, 'User {user_id} logged in', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].data).toEqual({
      user_id: 12345,
      ...obj,
    })
  })

  it('structured data takes precedence over the pino "mergingObject"', () => {
    const obj = { foo: 'bar', user_id: 9999 }
    logger.info(obj, 'User {user_id} logged in', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].data).toEqual({
      user_id: 12345,
      foo: 'bar',
    })
  })

  it('structured data takes precedence over the pino bindings', () => {
    const obj = { foo: 'bar', user_id: 9999 }
    // @ts-expect-error This is a non-standard pino usage
    logger.child(obj).info('User {user_id} logged in', {
      user_id: 12345,
    })

    expect(capturedLogs).toHaveLength(1)
    expect(capturedLogs[0].msg).toBe('User 12345 logged in')
    expect(capturedLogs[0].msg_tpl).toBe('User {user_id} logged in')
    expect(capturedLogs[0].data).toEqual({
      user_id: 12345,
      foo: 'bar',
    })
  })

  describe('object without message', () => {
    it('uses error message when only an Error is passed', () => {
      const error = new Error('Something went wrong')
      logger.error(error)

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Something went wrong')
      expect(capturedLogs[0].msg_tpl).toBe('Something went wrong')
      expect(capturedLogs[0].err).toEqual({
        message: 'Something went wrong',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
      expect(capturedLogs[0].data).toBeUndefined()
    })

    it('uses err.message when object with error is passed', () => {
      const error = new Error('Internal server error')
      logger.error({ err: error })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Internal server error')
      expect(capturedLogs[0].msg_tpl).toBe('Internal server error')
      expect(capturedLogs[0].err).toEqual({
        message: 'Internal server error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
      expect(capturedLogs[0].data).toBeUndefined()
    })

    it('preserves extra structured data alongside error', () => {
      const error = new Error('Unhandled exception')
      logger.error({ err: error, ctx: 'ExceptionFilter', status_code: 500 })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Unhandled exception')
      expect(capturedLogs[0].err).toEqual({
        message: 'Unhandled exception',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
      expect(capturedLogs[0].data).toEqual({
        ctx: 'ExceptionFilter',
        status_code: 500,
      })
    })

    it('handles plain object without error', () => {
      logger.info({ user_id: 123, action: 'login' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('')
      expect(capturedLogs[0].msg_tpl).toBe('')
      expect(capturedLogs[0].data).toEqual({
        user_id: 123,
        action: 'login',
      })
      expect(capturedLogs[0].err).toBeUndefined()
    })

    it('respects custom errorKey with object-only pattern', () => {
      const customLogger = pino(
        {
          errorKey: 'pinoError',
          hooks: structuredLogger(),
        },
        mockStream,
      )

      const error = new Error('Custom key error')
      customLogger.error({ pinoError: error, ctx: 'Test' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Custom key error')
      expect(capturedLogs[0].pinoError).toEqual({
        message: 'Custom key error',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
      expect(capturedLogs[0].data).toEqual({ ctx: 'Test' })
    })

    it('handles HttpException-like errors (e.g. InternalServerErrorException)', () => {
      // Simulates what nestjs-pino sends for NestJS HttpExceptions
      class HttpException extends Error {
        constructor(
          public readonly response: string | object,
          public readonly status: number,
        ) {
          super(
            typeof response === 'string' ? response : JSON.stringify(response),
          )
          this.name = 'InternalServerErrorException'
        }
        getStatus() {
          return this.status
        }
        getResponse() {
          return this.response
        }
      }

      const exception = new HttpException('Internal Server Error', 500)
      logger.error({ err: exception, ctx: 'ExceptionsHandler' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('Internal Server Error')
      expect(capturedLogs[0].err).toEqual(
        expect.objectContaining({
          message: 'Internal Server Error',
          stack: expect.any(String) as unknown,
        }),
      )
      expect(capturedLogs[0].data).toEqual({ ctx: 'ExceptionsHandler' })
    })

    it('handles HttpException-like errors with object response', () => {
      class HttpException extends Error {
        constructor(
          public readonly response: string | object,
          public readonly status: number,
        ) {
          super(
            typeof response === 'string' ? response : JSON.stringify(response),
          )
          this.name = 'ServiceUnavailableException'
        }
        getStatus() {
          return this.status
        }
        getResponse() {
          return this.response
        }
      }

      const exception = new HttpException(
        {
          statusCode: 503,
          message: 'Database connection failed',
          error: 'Service Unavailable',
        },
        503,
      )
      logger.error({ err: exception, ctx: 'DatabaseModule' })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe(
        '{"statusCode":503,"message":"Database connection failed","error":"Service Unavailable"}',
      )
      expect(capturedLogs[0].err).toEqual(
        expect.objectContaining({
          message:
            '{"statusCode":503,"message":"Database connection failed","error":"Service Unavailable"}',
          stack: expect.any(String) as unknown,
        }),
      )
      expect(capturedLogs[0].data).toEqual({ ctx: 'DatabaseModule' })
    })

    it('merges child bindings with object-only pattern', () => {
      logger.child({ request_id: 'abc-123' }).error({ err: new Error('fail') })

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('fail')
      expect(capturedLogs[0].err).toEqual({
        message: 'fail',
        type: 'Error',
        stack: expect.any(String) as unknown,
      })
      expect(capturedLogs[0].data).toEqual({ request_id: 'abc-123' })
    })
  })

  describe('pino default behaviour', () => {
    it('maintains pino log levels', () => {
      // @ts-expect-error This is a non-standard pino usage
      logger.debug('Debug {message}', { message: 'test' })
      // @ts-expect-error This is a non-standard pino usage
      logger.info('Info {message}', { message: 'test' })
      // @ts-expect-error This is a non-standard pino usage
      logger.warn('Warning {code}', { code: '404' })
      // @ts-expect-error This is a non-standard pino usage
      logger.error('Error {type}', { type: 'validation' })

      expect(capturedLogs).toHaveLength(4)
      expect(capturedLogs[0].level).toBe(20)
      expect(capturedLogs[1].level).toBe(30)
      expect(capturedLogs[2].level).toBe(40)
      expect(capturedLogs[3].level).toBe(50)
    })

    it('maintains standard message with no args', () => {
      logger.info('This is a simple message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('This is a simple message')
      expect(capturedLogs[0].msg_tpl).toBe('This is a simple message')
      expect(capturedLogs[0].data).toBeUndefined()
      expect(capturedLogs[0].args).toBeUndefined()
    })

    it('maintains standard string formatting', () => {
      logger.info('User %d logged in from %s', 12345, 'Salzburg')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('User 12345 logged in from Salzburg')
      expect(capturedLogs[0].msg_tpl).toBe('User %d logged in from %s')
      expect(capturedLogs[0].data).toBeUndefined()
      expect(capturedLogs[0].args).toEqual([12345, 'Salzburg'])
    })

    it('maintains standard behaviour with string interpolation', () => {
      const userId = 12345
      const location = 'Salzburg'
      logger.info(`User ${userId} logged in from ${location}`)

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].msg).toBe('User 12345 logged in from Salzburg')
      expect(capturedLogs[0].msg_tpl).toBe('User 12345 logged in from Salzburg')
      expect(capturedLogs[0].data).toBeUndefined()
      expect(capturedLogs[0].args).toBeUndefined()
    })
  })
})

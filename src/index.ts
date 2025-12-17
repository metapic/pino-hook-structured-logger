import { LogFn, Logger } from 'pino'

export type StructuredLoggerOptions = {
  /**
   * Key for the message template in the structured log object.
   * Defaults to 'msg_tpl'.
   */
  messageTemplateKey?: string

  /**
   * Key for the structured data in the log object.
   * Defaults to 'data'.
   */
  dataKey?: string

  /**
   * Key for the *unmatched* arguments in the log object.
   * Defaults to 'args'.
   */
  argsKey?: string

  /**
   * Whether to move the error object from the structured data
   * to the top-level error key.
   * Defaults to true.
   */
  unwrapErrors?: boolean

  /**
   * Keys to move from the structured data to the top-level
   * log object, if they exist.
   * This is useful for moving keys that are frequently used
   * in queries or filters, such as 'user_id', 'context', etc.
   * Defaults to an empty array, meaning no keys are unwrapped.
   */
  unwrapKeys?: string[]
}

/**
 * Sets up structured logging for a Pino logger. Usage:
 *
 * ```ts
 * import pino from 'pino'
 * import { structuredLogger } from 'path-to-structured-logger'
 *
 * const logger = pino({
 *   level: 'debug',
 *   hooks: structuredLogger({
 *     messageTemplateKey: 'msg_tpl',
 *     dataKey: 'data',
 *     argsKey: 'args',
 *     unwrapErrors: true,
 *   }),
 * })
 * ```
 *
 * This is the **FULL** list of supported argument combinations;
 * where `m` is the _message_, `o` is an object with structured data
 * (the Pino "merging object"), and `e` is an `Error` object.
 *
 * - 2 arguments:
 *   - `2.m`   -> `logger.log('message', arg1)`
 *   - `2.mo`  -> `logger.log('message', { obj })`
 *   - `2.om`  -> `logger.log({ obj }, 'message')`
 *   - `2.em`  -> `logger.log(err, 'message')`
 *
 * - 3 arguments:
 *   - `3.m`   -> `logger.log(err, 'message', arg1, arg2)`
 *   - `3.mo`  -> `logger.log({ obj }, 'message', arg1)`
 *   - `3.om`  -> `logger.log({ obj }, 'message', arg)`
 *   - `3.omo` -> `logger.log({ obj }, 'message', { obj })`
 *   - `3.em`  -> `logger.log(err, 'message', arg1)`
 *   - `3.emo` -> `logger.log(err, 'message', { obj })`
 *
 * - 4 arguments:
 *   - `4.m`   -> `logger.log('message', arg1, arg2, arg3)`
 *   - `4.mo`  -> `logger.log('message', { obj }, arg1, arg2)`
 *   - `4.om`  -> `logger.log({ obj }, 'message', arg1, arg2)`
 *   - `4.omo` -> `logger.log({ obj }, 'message', { obj }, arg1)`
 *   - `4.em`  -> `logger.log(err, 'message', arg1, arg2)`
 *   - `4.emo` -> `logger.log(err, 'message', { obj }, arg1)`
 *
 * - n arguments:
 *   - `n.m`   -> `logger.log('message', arg1, arg2, arg3, arg4, ...)`
 *   - `n.mo`  -> `logger.log('message', { obj }, arg1, arg2, arg3, ...)`
 *   - `n.om`  -> `logger.log({ obj }, 'message', arg1, arg2, arg3, ...)`
 *   - `n.omo` -> `logger.log({ obj }, 'message', { obj }, arg1, arg2, arg3, ...)`
 *   - `n.em`  -> `logger.log(err, 'message', arg1, arg2, arg3, ...)`
 *   - `n.emo` -> `logger.log(err, 'message', { obj }, arg1, arg2, arg3, ...)`
 */
export const structuredLogger = (opts: StructuredLoggerOptions = {}) => ({
  logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn) {
    const {
      messageTemplateKey = 'msg_tpl',
      dataKey = 'data',
      argsKey = 'args',
      unwrapErrors = true,
      unwrapKeys = [],
    } = opts

    if (!args || args.length < 1) {
      // We need at least one argument to process the log message.
      return
    }

    const { messageTemplate, structured, error } = extractStructuredData(args)
    const structuredWithBindings = { ...this.bindings(), ...structured }
    const formattedMessage = reformatMessageWithRemainingArgs(
      formatMessage(messageTemplate, structuredWithBindings),
      structuredWithBindings,
      args,
    )

    const obj: Record<string, unknown> = {
      [messageTemplateKey]: messageTemplate,
      ...wrapError(structuredWithBindings, error, {
        errorKey: getErrorKey(this),
        unwrapErrors,
      }),
      ...wrapStructuredData(structuredWithBindings, {
        dataKey,
        unwrapKeys,
      }),
      ...(args.length > 0 ? { [argsKey]: args } : {}),
    }

    method.apply(this, [obj, formattedMessage, ...args])
  },
})

const formatMessage = (
  message: string,
  structured: Record<string, unknown>,
): string => {
  return message.replace(/{(\w+)}/g, (_: string, key: string) => {
    return Object.prototype.hasOwnProperty.call(structured, key)
      ? String(structured[key])
      : `{${key}}`
  })
}

const extractStructuredData = (
  args: Parameters<LogFn>,
): {
  messageTemplate: string
  structured: Record<string, unknown>
  error?: Error
} => {
  // n.m and n.mo
  if (typeof args[0] === 'string') {
    return {
      messageTemplate: args.shift() as string,
      ...tryParseNextArgAsObject(args),
    }
  }

  // n.om and n.em
  // n.omo and n.emo
  if (typeof args[0] === 'object' && typeof args[1] === 'string') {
    const messageTemplate = args.splice(1, 1)[0] as string
    const obj1 = tryParseNextArgAsObject(args)
    const obj2 = tryParseNextArgAsObject(args)

    return {
      messageTemplate,
      structured: {
        ...(obj1.structured ?? {}),
        ...(obj2.structured ?? {}),
      },
      error: obj1.error ?? obj2.error ?? undefined,
    }
  }

  // this should never happen. WIP
  return { messageTemplate: '', structured: {}, error: undefined }
}

const tryParseNextArgAsObject = (
  args: Parameters<LogFn>,
): {
  structured: Record<string, unknown>
  error?: Error
} => {
  if (args.length > 0 && typeof args[0] === 'object') {
    const obj = args.shift() as Error | Record<string, unknown>
    return obj instanceof Error
      ? { structured: {}, error: obj }
      : { structured: obj }
  }
  return {
    structured: {},
  }
}

const reformatMessageWithRemainingArgs = (
  formattedMessage: string,
  structured: Record<string, unknown>,
  args: Parameters<LogFn>,
) => {
  if (args.length === 0) {
    return formattedMessage
  }

  const remainingPlaceholders =
    tryExtractRemainingPlaceholders(formattedMessage)

  for (
    let i = 0;
    i < Math.min(remainingPlaceholders.length, args.length);
    i++
  ) {
    const placeholder = remainingPlaceholders[i]
    structured[placeholder] = args.shift()
  }

  return formatMessage(formattedMessage, structured)
}

const tryExtractRemainingPlaceholders = (messageTemplate: string): string[] => {
  const matches = messageTemplate.match(/{(\w+)}/g)
  return matches ? matches.map((m) => m.slice(1, -1)) : []
}

const wrapError = (
  structured: Record<string, unknown>,
  currentError: Error | undefined,
  opts: { errorKey: string; unwrapErrors: boolean },
) => {
  if (currentError) {
    return { [opts.errorKey]: currentError }
  }

  const error = structured[opts.errorKey]
  if (error && error instanceof Error) {
    delete structured[opts.errorKey]
    return { [opts.errorKey]: error }
  }

  return {}
}

const wrapStructuredData = (
  structured: Record<string, unknown>,
  opts: { dataKey: string; unwrapKeys: string[] },
) => {
  if (Object.keys(structured).length === 0) {
    return {}
  }

  const unwrapped: Record<string, unknown> = {}

  for (const key of opts.unwrapKeys) {
    const value = structured[key]
    if (value !== undefined) {
      unwrapped[key] = value
      delete structured[key]
    }
  }

  if (Object.keys(structured).length === 0) {
    return unwrapped
  }

  return {
    ...unwrapped,
    [opts.dataKey]: structured,
  }
}

const getErrorKey = (logger: Logger): string => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const cachedErrorKey: string | undefined = (logger as any).__cachedErrorKey
  if (cachedErrorKey) {
    return cachedErrorKey
  }

  const errorKey = getPinoConfigValue<string>(logger, 'pino.errorKey') ?? 'err'
  Object.defineProperty(logger, '__cachedErrorKey', {
    value: errorKey,
    writable: false,
    configurable: false,
    enumerable: false,
  })

  return errorKey
}

const getPinoConfigValue = <T>(logger: Logger, key: string) => {
  const errorKeySymbol = Object.getOwnPropertySymbols(logger).find(
    (s) => s.description === key,
  )

  if (!errorKeySymbol) {
    return undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  return (logger as any)[errorKeySymbol] as T
}

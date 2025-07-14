import { LogFn, Logger } from 'pino'

export type StructuredLoggerOptions = {
  messageTemplateKey?: string
  dataKey?: string
  argsKey?: string
  errorKey?: string
  unwrapErrors?: boolean
  unwrapKeys?: string[]
}

/**
 * This is the FULL list of supported argument combinations:
 *
 *  2.m   logger.log('message', arg1)
 *  2.mo  logger.log('message', { obj })
 *  2.om  logger.log({ obj }, 'message')
 *  2.em  logger.log(err, 'message')
 *
 *  3.m   logger.log(err, 'message', arg1, arg2)
 *  3.mo  logger.log({ obj }, 'message', arg1)
 *  3.om  logger.log({ obj }, 'message', arg)
 *  3.omo logger.log({ obj }, 'message', { obj })
 *  3.em  logger.log(err, 'message', arg1)
 *  3.emo logger.log(err, 'message', { obj })
 *
 *  4.m   logger.log('message', arg1, arg2, arg3)
 *  4.mo  logger.log('message', { obj }, arg1, arg2)
 *  4.om  logger.log({ obj }, 'message', arg1, arg2)
 *  4.omo logger.log({ obj }, 'message', { obj }, arg1)
 *  4.em  logger.log(err, 'message', arg1, arg2)
 *  4.emo logger.log(err, 'message', { obj }, arg1)
 *
 *  n.m   logger.log('message', arg1, arg2, arg3, arg4, ...)
 *  n.mo  logger.log('message', { obj }, arg1, arg2, arg3, ...)
 *  n.om  logger.log({ obj }, 'message', arg1, arg2, arg3, ...)
 *  n.omo logger.log({ obj }, 'message', { obj }, arg1, arg2, arg3, ...)
 *  n.em  logger.log(err, 'message', arg1, arg2, arg3, ...)
 *  n.emo logger.log(err, 'message', { obj }, arg1, arg2, arg3, ...)
 */
export const structuredLogger = (opts: StructuredLoggerOptions = {}) => ({
  logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn) {
    const {
      messageTemplateKey = 'msg_tpl',
      dataKey = 'data',
      argsKey = 'args',
      errorKey = 'err', // todo: find a way to get the error key from pino. this[Symbol.for('pino.errorKey')]
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
      ...wrapError(structuredWithBindings, error, { errorKey, unwrapErrors }),
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
  opts: Required<Pick<StructuredLoggerOptions, 'errorKey' | 'unwrapErrors'>>,
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
  opts: Required<Pick<StructuredLoggerOptions, 'dataKey' | 'unwrapKeys'>>,
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

  return {
    ...unwrapped,
    [opts.dataKey]: structured,
  }
}

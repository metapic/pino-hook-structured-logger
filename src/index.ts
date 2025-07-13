import { LogFn, Logger } from 'pino'

export type StructuredLoggerOptions = {
  messageTemplateKey?: string
  structuredDataKey?: string
  argsKey?: string
  errorKey?: string
}

export const structuredLogger = (opts: StructuredLoggerOptions = {}) => ({
  logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn) {
    const {
      messageTemplateKey = 'msg_tpl',
      structuredDataKey = 'data',
      argsKey = 'args',
      errorKey = 'err', // todo: find a way to get the error key from pino. this[Symbol.for('pino.errorKey')]
    } = opts

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

    if (!args || args.length <= 1) {
      // We need at least two arguments to process a message template.
      return
    }

    const { messageTemplate, structured, error } =
      tryExtractObjectAndMessageTemplate(args)

    const formattedMessage = formatMessageTemplate(
      messageTemplate,
      structured ?? {},
    )

    const logObj: Record<string, unknown> = {
      [messageTemplateKey]: messageTemplate,
      ...(error ? { [errorKey]: error } : {}),
      ...(args.length > 0 ? { [argsKey]: args } : {}),
      ...(structured && Object.keys(structured).length > 0
        ? { [structuredDataKey]: structured }
        : {}),
    }

    method.apply(this, [logObj, formattedMessage, ...args])
  },
})

const formatMessageTemplate = (
  message: string,
  args: Record<string, unknown>,
): string => {
  return message.replace(/{(\w+)}/g, (_: string, key: string) => {
    return Object.prototype.hasOwnProperty.call(args, key)
      ? String(args[key])
      : `{${key}}`
  })
}

const tryExtractObjectAndMessageTemplate = (args: Parameters<LogFn>) => {
  // n.m and n.mo
  if (typeof args[0] === 'string') {
    return {
      messageTemplate: args.splice(0, 1)[0] as string,
      ...tryParseNextArgAsObject(args),
    }
  }

  // n.om and n.em
  // n.omo and n.emo
  if (typeof args[0] === 'object' && typeof args[1] === 'string') {
    const messageTemplate = args.splice(1, 1)[0] as string
    const obj1 = tryParseNextArgAsObject(args)
    const obj2 = tryParseNextArgAsObject(args)

    const error = obj1.error ?? obj2.error ?? undefined
    const structured = {
      ...(obj1.structured ?? {}),
      ...(obj2.structured ?? {}),
    }

    return {
      messageTemplate,
      ...(error ? { error } : {}),
      ...(structured ? { structured } : {}),
    }
  }

  // this should never happen. WIP
  return { messageTemplate: '', structured: undefined, error: undefined }
}

const tryParseNextArgAsObject = (args: Parameters<LogFn>) => {
  if (args.length > 0 && typeof args[0] === 'object') {
    const obj = args.splice(0, 1)[0] as Error | Record<string, unknown>
    const key = obj instanceof Error ? 'error' : 'structured'
    return { [key]: obj } as const
  }
  return {}
}

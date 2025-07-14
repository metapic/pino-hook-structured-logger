# pino-hook-structured-logger

Adds support for [structured logs](#structured-logging) to [pino](https://github.com/pinojs/pino) via a [`logMethod` hook](https://getpino.io/#/docs/api?id=logmethod).

## Structured Logging

Captures _structured data_ and adds it to the JSON payload. The _unformatted message template_ is added to the payload too. Multiple ways of passing structured data are supported, including the [default pino `mergingObject`](https://getpino.io/#/docs/api?id=mergingobject-object).

### TL;DR - Example Code

See all supported log formats in [the spec](./test/index.spec.ts).

```js
// arguments after the message are captured as structured data
// in order of occurrence in the message template:
logger.info('User {user_id} logged in from {location}', 12345, 'Salzburg')

// alternatively, a dedicated object as first argument after the message can
// be used for structured data. this is more verbose, but *may* be more readable.
logger.info('User {user_id} logged in from {location}', {
  user_id: 12345,
  location: 'Salzburg',
})

// existing bindings (child logger) are respected.
// the dedicated structured data object takes precedence over the bindings,
// if both are present and there are any conflicting keys.
const loggerWithBindings = logger.child({ user_id: 12345 })
loggerWithBindings.info('User {user_id} logged in from {location}', 'Salzburg')

// pino's mergingObject is a valid source of structured data too.
// the dedicated structured data object takes precedence over the mergingObject,
// if both are present and there are any conflicting keys.
logger.info(
  { user_id: 12345, location: 'Salzburg' },
  'User {user_id} logged in from {location}',
)

// any combination of the above is supported too.
// though you should *probably* not do this...

logger.info({ user_id: 12345 }, 'User {user_id} logged in from {location}', {
  location: 'Salzburg',
})

logger.info(
  'User {user_id} logged in from {location}',
  { location: 'Salzburg' },
  12345,
)
```

All examples produce this output:

```json
{
  "level": 30,
  "time": 1752419866224,
  "pid": 54900,
  "hostname": "953e747d91b4",
  "msg": "User 12345 logged in from Salzburg",
  "msg_tpl": "User {user_id} logged in from {location}",
  "data": {
    "user_id": 12345,
    "location": "Salzburg"
  }
}
```

#### Additional Arguments

Any _additional, unmatched_ arguments are captured and added to the log output with the `args` key:

```js
logger.info(
  'User {user_id} logged in from {location}',
  12345,
  'Salzburg',
  'arg1',
  { arg_num: 2 },
)
```

```json
{
  //...
  "msg": "User 12345 logged in from Salzburg",
  "msg_tpl": "User {user_id} logged in from {location}",
  "data": {
    "user_id": 12345,
    "location": "Salzburg"
  },
  "args": [
    "arg1",
    {
      "arg_num": 2
    }
  ]
}
```

## Usage

Simply configure your pino instance to use `structuredLogger()` as hooks. You can _optionally_ customize the behaviour of the structured logger by passing a [configuration object](./src/index.ts).

```ts
import pino from 'pino'
import { structuredLogger } from '@metapic/pino-hook-structured-logger'

const logger = pino({
  level: 'debug',
  hooks: structuredLogger({
    messageTemplateKey: 'msg_tpl',
    dataKey: 'data',
    argsKey: 'args',
    unwrapErrors: true,
  }),
})
```

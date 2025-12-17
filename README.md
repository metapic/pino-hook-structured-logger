# pino-hook-structured-logger

Adds support for [structured logs](#structured-logging) to [Pino](https://github.com/pinojs/pino) via a [`logMethod` hook](https://getpino.io/#/docs/api?id=logmethod).

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

// Pino's mergingObject is a valid source of structured data too.
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

Simply configure your Pino instance to use `structuredLogger()` as hooks. You can _optionally_ customize the behaviour of the structured logger by passing a [configuration object](./src/index.ts).

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

## Performance

The added functionality comes at a cost: the structured logger achieves roughly **half** the throughput of the standard Pino logger. Pino is _pretty fast_, so in most real-world use cases this throughput is totally fine.

See benchmark tests in [`index.bench.ts`](./test/index.bench.ts).

```
$ npm run bench

> @metapic/pino-hook-structured-logger@0.0.0-development bench
> vitest bench

Benchmarking is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

DEV  v3.2.4 /workspaces/pino-hook-structured-logger

  ✓ test/index.bench.ts > info with params 2811ms
      name                       hz     min      max    mean     p75     p99    p995    p999     rme  samples
    · standard logger    893,856.90  0.0006  33.1586  0.0011  0.0007  0.0013  0.0016  0.0038  ±9.51%   893857
    · structured logger  388,408.52  0.0018   7.2970  0.0026  0.0020  0.0034  0.0038  0.0085  ±4.67%   388409

  ✓ test/index.bench.ts > info with message only 3037ms
      name                         hz     min      max    mean     p75     p99    p995    p999      rme  samples
    · standard logger    1,073,454.90  0.0003  29.2559  0.0009  0.0004  0.0015  0.0017  0.0041  ±12.81%  1073455
    · structured logger    547,664.58  0.0011  15.1655  0.0018  0.0013  0.0025  0.0027  0.0062   ±6.78%   547665

BENCH  Summary

  standard logger - test/index.bench.ts > info with params
    2.30x faster than structured logger

  standard logger - test/index.bench.ts > info with message only
    1.96x faster than structured logger
```

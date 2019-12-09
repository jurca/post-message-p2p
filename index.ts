interface IPostMessageImplementor {
  postMessage: typeof postMessage
}

export interface IConnectOptions {
  channel: unknown
  timeout?: number
  origin?: string
  handshakeRetries?: number
  handshakeRetryDelay?: number
}

interface IConfirmationCallbackMap {
  [messageId: string]: {
    callback: () => void,
    channel: unknown,
    messageTarget: IPostMessageImplementor,
    targetOrigin: string,
  }
}

export interface IAgentOptions extends IConnectOptions {
  peer: IPostMessageImplementor
  onMessage(data: unknown): void
}

type Client = (data: unknown, transferable?: Transferable[]) => Promise<void>
type MessageListener = (data: unknown, sender: IPostMessageImplementor, senderOrigin: string) => void

const MIN_SAFE_INTEGER = (Number as any).MIN_SAFE_INTEGER || -9007199254740991
const DEFAULT_MESSAGE_CONFIRMATION_TIMEOUT = 10_000 // milliseconds
const DEFAULT_HANDSHAKE_RETRIES = 2
const DEFAULT_HANDSHAKE_RETRY_DELAY = 500 // milliseconds
const HOST_ID = Date.now().toString(36)
let lastClientId = MIN_SAFE_INTEGER
const messageReceivedConfirmationCallbacks: IConfirmationCallbackMap = {}

export function createAgent(options: IAgentOptions): Promise<Client> {
  listen(options.channel, options.origin ? [options.origin] : [], options.onMessage)
  return connect(options.peer, options)
}

export function connect(target: IPostMessageImplementor, options: IConnectOptions): Promise<Client> {
  const origin = options.origin || '*'
  const clientId = `${HOST_ID}:${(++lastClientId).toString(36)}`
  const timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_MESSAGE_CONFIRMATION_TIMEOUT
  const handshakeRetries = (
    typeof options.handshakeRetries === 'number' ? options.handshakeRetries : DEFAULT_HANDSHAKE_RETRIES
  )
  const handshakeRetryDelay = (
    typeof options.handshakeRetryDelay === 'number' ? options.handshakeRetryDelay : DEFAULT_HANDSHAKE_RETRY_DELAY
  )
  if (timeout !== Math.floor(timeout) || timeout <= 0) {
    throw new TypeError(
      `The timeout option must be a positive integer, ${timeout} was provided`,
    )
  }
  if (handshakeRetries !== Math.floor(handshakeRetries) || handshakeRetries < 0) {
    throw new TypeError(
      `The handshakeRetries option must be a non-negative integer, ${handshakeRetries} was provided`,
    )
  }
  if (handshakeRetryDelay !== Math.floor(handshakeRetryDelay) || handshakeRetryDelay <= 0) {
    throw new TypeError(
      `The handshakeRetryDelay option must be a positive integer, ${handshakeRetryDelay} was provided`,
    )
  }

  let lastMessageId = MIN_SAFE_INTEGER

  const connection = (messageContent: object, transferable?: Transferable[]): Promise<void> => {
    const messageId = `${clientId}:${(++lastMessageId).toString(36)}`
    let resultResolver: null | (() => void) = null
    let messageTimeoutId: null | number = null
    const resultPromise = new Promise<void>((resolve, reject) => {
      resultResolver = resolve
      messageTimeoutId = setTimeout(() => {
        delete messageReceivedConfirmationCallbacks[messageId]
        const timeoutError = new Error(`The message timed out after ${timeout} milliseconds`)
        timeoutError.name = 'TimeoutError'
        reject(timeoutError)
      }, timeout)
    })

    messageReceivedConfirmationCallbacks[messageId] = {
      callback() {
        clearTimeout(messageTimeoutId!)
        delete messageReceivedConfirmationCallbacks[messageId]
        resultResolver!()
      },
      channel: options.channel,
      messageTarget: target,
      targetOrigin: origin,
    }
    target.postMessage(
      {
        ...messageContent,
        channel: options.channel,
        messageId,
      },
      origin,
      transferable,
    )

    return resultPromise
  }

  const client: Client = (data: unknown, transferable?: Transferable[]): Promise<void> => {
    return connection({data}, transferable)
  }

  return new Promise((resolve, reject) => {
    attemptHandshake()
    let retriesLeft = handshakeRetries

    function attemptHandshake() {
      connection({handshake: clientId}).then(() => {
        resolve(client)
      }).catch(() => {
        if (retriesLeft--) {
          setTimeout(attemptHandshake, handshakeRetryDelay)
        } else {
          reject(new Error(`Failed to establish connection: handshake failed after ${handshakeRetries + 1} attempts`))
        }
      })
    }
  })
}

export function listen(channel: unknown, origins: string[], messageListener: MessageListener): void {
  addEventListener('message', (event: MessageEvent) => {
    const {data, origin, source} = event
    if (origins.length && origins.indexOf(origin) === -1) {
      return
    }

    if (!source || !data || typeof data.messageId !== 'string' || data.channel !== channel) {
      return
    }

    if (!('handshake' in data) && !('data' in data)) {
      return
    }

    const postOrigin = origin === 'null' ? '*' : origin;

    if ('data' in data) {
      messageListener(data.data, source as IPostMessageImplementor, postOrigin)
    }

    (event.source as IPostMessageImplementor).postMessage({
      channel,
      messageId: data.messageId,
      received: true,
    }, postOrigin)
  })
}

addEventListener('message', (event: MessageEvent) => {
  const {data, origin, source} = event
  if (
    !data ||
    typeof data.messageId !== 'string' ||
    !messageReceivedConfirmationCallbacks[data.messageId] ||
    data.received !== true
  ) {
    return
  }

  const callbackInfo = messageReceivedConfirmationCallbacks[data.messageId]
  if (
    source !== callbackInfo.messageTarget ||
    (callbackInfo.targetOrigin !== '*' && origin !== callbackInfo.targetOrigin) ||
    data.channel !== callbackInfo.channel
  ) {
    return
  }

  callbackInfo.callback()
})

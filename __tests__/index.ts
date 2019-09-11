import {connect} from '../index'

describe('P2P postMessage agent', () => {
  const messageConfirmationListener = (addEventListener as any).calls[0][1]

  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('should register a message event global listener during module initialization', () => {
    expect((addEventListener as any).calls.length).toBe(1)
    const [callArgs] = (addEventListener as any).calls
    expect(callArgs.length).toBe(2)
    expect(callArgs[0]).toBe('message')
    expect(typeof callArgs[1]).toBe('function')
    expect(callArgs[1].length).toBe(1)
  })

  describe('connect', () => {
    it('should set up the specified connection to the provided target', async () => {
      const channel = `channel ${Math.random()}`
      const origin = `some.site${Math.random()}.com`
      const messageTimeout = Math.floor(Math.random() * 1000) + 10
      const retries = Math.floor(Math.random() * 3) + 1
      const retryDelay = Math.floor(Math.random() * 1000) + 10
      const mockPostMessage = jest.fn()
      const mockPostMessageCalls = mockPostMessage.mock.calls
      const mockTarget = {
        postMessage: mockPostMessage,
      }
      const connectionPromise = connect(mockTarget, {
        channel,
        handshakeRetries: retries,
        handshakeRetryDelay: retryDelay,
        origin,
        timeout: messageTimeout,
      })

      const knownMessageIds = []

      // let all the retries roll out
      for (let handshakeIteration = 0; handshakeIteration < retries; handshakeIteration++) {
        expect(mockPostMessage).toHaveBeenCalledTimes(handshakeIteration + 1)
        expect(mockPostMessage).toHaveBeenLastCalledWith(
          {
            channel,
            handshake: mockPostMessageCalls[handshakeIteration][0].handshake,
            messageId: mockPostMessageCalls[handshakeIteration][0].messageId,
          },
          origin,
          undefined,
        )
        expect(knownMessageIds.indexOf(mockPostMessageCalls[handshakeIteration][0].messageId)).toBe(-1)
        knownMessageIds.push(mockPostMessageCalls[handshakeIteration][0].messageId)
        expect(typeof mockPostMessageCalls[handshakeIteration][0].handshake).toBe('string')
        expect(mockPostMessageCalls[handshakeIteration][0].handshake).not.toBe('')
        expect(typeof mockPostMessageCalls[handshakeIteration][0].messageId).toBe('string')
        expect(mockPostMessageCalls[handshakeIteration][0].messageId).not.toBe('')
        jest.advanceTimersByTime(messageTimeout)
        expect(mockPostMessage).toHaveBeenCalledTimes(handshakeIteration + 1)
        await Promise.resolve().then(() => null) // wait for the catch callback of the handshake initiator to be invoked
        jest.advanceTimersByTime(retryDelay)
      }

      // accept the handshake
      expect(mockPostMessage).toHaveBeenCalledTimes(retries + 1)
      knownMessageIds.push(mockPostMessageCalls[retries][0].messageId)
      messageConfirmationListener({
        data: {
          channel,
          messageId: knownMessageIds[knownMessageIds.length - 1],
          received: true,
        },
        origin,
        source: mockTarget,
      })

      return connectionPromise
    })

    it('should reject the attempt if the handshake fails', async () => {
      const mockTarget = {
        postMessage: jest.fn(),
      }
      const connectionPromise = connect(mockTarget, {
        channel: 'foo',
        handshakeRetries: 1,
        handshakeRetryDelay: 100,
        origin: 'some.site.com',
        timeout: 100,
      })

      for (let i = 0; i < 2; i++) {
        jest.advanceTimersByTime(100)
        await Promise.resolve().then(() => null) // wait for the catch callback of the handshake initiator to be invoked
        jest.advanceTimersByTime(100)
      }

      try {
        await connectionPromise
      } catch (error) {
        return
      }

      throw new Error('The handshake should have been rejected')
    })
  })

  afterEach(() => {
    ;(addEventListener as any).calls.splice(0) // tslint:disable-line align semicolon whitespace
    ;(postMessage as any).calls.splice(0) // tslint:disable-line align whitespace
    jest.clearAllTimers() // tslint:disable-line align
  })
})

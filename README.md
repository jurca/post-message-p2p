# post-message-p2p

[![Build Status](https://travis-ci.org/jurca/post-message-p2p.svg?branch=master)](https://travis-ci.org/jurca/post-message-p2p)
[![npm](https://img.shields.io/npm/v/@jurca/post-message-p2p.svg)](https://www.npmjs.com/package/@jurca/post-message-p2p)
[![License](https://img.shields.io/npm/l/@jurca/post-message-p2p.svg)](LICENSE)
![npm type definitions](https://img.shields.io/npm/types/@jurca/post-message-p2p.svg)

A client-server or peer-to-peer postMessage-based messaging library with
TypeScript support.

## Installation

`post-message-p2p` is available as npm package, you can use `npm` to install
it:

```
npm install --save @jurca/post-message-p2p
```

## Usage

### Client-server messaging model

To connect to another context (frame, window, service worker or another object
implementing the
[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
API), use the `connect` function:

```javascript
import {connect} from '@jurca/post-message-p2p'

(async () => {
  const sendMessage = await connect(someIframe.contentWindow, {
    // A string, number, symbol, boolean, null or undefined identifying the
    // communication channel with the peer.
    channel: 'foo',
    // An optional timeout for receiving a confirmation that the peer has
    // received the message, defaults to 10 seconds. Specified in milliseconds,
    // must be a positive integer.
    timeout: 100,
    // The optional origin that is allowed to receive messages sent through
    // this connection. Defaults to '*', but is recommended to be set for
    // security reasons.
    origin: 'https://some.origin.org',
    // The optional number of retries when trying to perform a handshake with
    // the provided peer. The connection will not be established if the peer
    // will not be responding to the handshake messages. Defaults to 2.
    handshakeRetries: 2,
    // An optional delay between handshake attempts in milliseconds. Defaults
    // to 500.
    handshakeRetryDelay: 3000,
  })

  // The returned promise resolves when the peer confirms receiving the
  // message, or rejects if the peer does not respond within the timeout.
  await sendMessage(anyDataYouWantToSend)
})()
```

Note that the peer must be listening for messages for a connection to be
established. Use the `listen` function to listen for incoming messages:

```javascript
import {listen} from '@jurca/post-message-p2p'

listen(
  // A string, number, symbol, boolean, null or undefined identifying the
  // communication channel with the peer.
  'foo',
  // Whitelisted origins from which the messages will be received. Messages
  // originating in other origins will be ignored. Use an empty array if you
  // need to listen for messages from any origin, however, this is highly
  // discouraged for security reasons.
  ['https://some.origin.org', 'https://other.origin.org'],
  (messageData) => {
    // This callback will be invoked for every data message sent to this peer
    // from a whitelisted origin if matching the specified channel.
    // The listener will confirm receiving the message to the sender *after*
    // invoking this callback. No confirmation will be sent to the sender if
    // this callback throws an error. The value returned from the callback
    // is ignored.
  },
)
```

### Peer-to-peer messaging model

Use the `createAgent` to establish a connection with a peer:

```javascript
import {createAgent} from '@jurca/post-message-p2p'

(async () => {
  const sendMessage = await createAgent({
    peer: someIframe.contentWindow,
    channel: 'fooBar',
    onMessage: (data) => {
      // The callback invoked for every data message (see the listen function).
    },
    // The rest of optional configuration options passed to the connect
    // function is allowed here too.
  })
})()
```

The `createAgent` will set up a message listener for incoming messages (just
like the `listen` function) and then attempts to create a connection and do a
handshake with the provided peer (just like the `connect` function).

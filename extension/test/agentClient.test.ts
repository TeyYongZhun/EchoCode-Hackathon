import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import { WebSocketServer, type WebSocket } from 'ws';
import { AgentClient } from '../src/voice/AgentClient.ts';

const log = { info() {}, warn() {}, error() {} } as unknown as vscode.LogOutputChannel;

interface Harness {
  client: AgentClient;
  /** What the client passed on to EchoCode, in order. */
  seen: string[];
  /** Message types the client sent to the server. */
  sent: string[];
  /** Sends events as the Voice Agent would, and waits until the client has handled them. */
  serverSends(...messages: object[]): Promise<void>;
  close(): void;
}

/** Connects an AgentClient to a local stand-in for AssemblyAI's Voice Agent. */
async function connect(): Promise<Harness> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const sent: string[] = [];
  let serverSocket: WebSocket | undefined;
  server.on('connection', (socket) => {
    serverSocket = socket;
    socket.on('message', (raw) => {
      const type = (JSON.parse(raw.toString()) as { type: string }).type;
      sent.push(type);
      if (sent.length === 1) socket.send(JSON.stringify({ type: 'session.ready', session_id: 'test-session' }));
    });
  });

  const seen: string[] = [];
  let marker = '';
  let synced = () => {};
  const client = new AgentClient(
    {
      audio: (data) => seen.push(`audio:${data}`),
      // The harness uses user transcripts to know when earlier events were handled.
      inputTranscript: (text) => (text === marker ? synced() : seen.push(`user:${text}`)),
      outputTranscript: (text) => seen.push(`word:${text.trim()}`),
      turnComplete: () => seen.push('done'),
      interrupted: () => seen.push('interrupted'),
      closed: () => {},
    },
    log,
  );
  const { port } = server.address() as AddressInfo;
  await client.connect({ token: 'test', url: `ws://127.0.0.1:${port}`, session: { system_prompt: 'test' }, expiresAt: '' });

  let syncs = 0;
  return {
    client,
    seen,
    sent,
    async serverSends(...messages) {
      marker = `sync-${++syncs}`;
      const handled = new Promise<void>((resolve) => (synced = resolve));
      for (const message of [...messages, { type: 'transcript.user', text: marker }]) {
        serverSocket!.send(JSON.stringify(message));
      }
      await handled;
    },
    close() {
      client.close();
      for (const socket of server.clients) socket.terminate();
      server.close();
    },
  };
}

const started = { type: 'reply.started' };
const audio = (data: string) => ({ type: 'reply.audio', data });
const word = (delta: string) => ({ type: 'transcript.agent.delta', delta, start_ms: 0 });
const completed = { type: 'reply.done', status: 'completed' };
const interrupted = { type: 'reply.done', status: 'interrupted' };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('an answer interrupted with the hotkey stops, and none of it plays after the next question', async () => {
  const h = await connect();
  try {
    h.client.startActivity();
    h.client.endActivity();
    await h.serverSends(started, audio('a1'), word('Line'));
    assert.deepEqual(h.seen, ['audio:a1', 'word:Line']);

    // Hotkey pressed mid-answer: the server keeps streaming the old reply.
    h.client.cancelReply();
    await h.serverSends(audio('a2'), word('twelve'));
    // The user asks something new while the old reply is still arriving.
    h.client.startActivity();
    await h.serverSends(audio('a3'));
    h.client.endActivity();
    // The server hears the new question, cuts the old reply off and answers.
    await h.serverSends(interrupted, started, audio('b1'), word('Stopping.'), completed);

    assert.deepEqual(h.seen, ['audio:a1', 'word:Line', 'audio:b1', 'word:Stopping.', 'done']);
  } finally {
    h.close();
  }
});

test('after Stop, the rest of the answer is dropped and the next answer plays', async () => {
  const h = await connect();
  try {
    h.client.startActivity();
    h.client.endActivity();
    await h.serverSends(started, audio('a1'));
    h.client.cancelReply();
    await h.serverSends(audio('a2'), word('more'), completed);

    h.client.startActivity();
    h.client.endActivity();
    await h.serverSends(started, audio('b1'), completed);

    assert.deepEqual(h.seen, ['audio:a1', 'audio:b1', 'done']);
  } finally {
    h.close();
  }
});

test('a reply still arriving when a new question starts belongs to the old one', async () => {
  const h = await connect();
  try {
    // A reply that starts after Stop is passed on (the idle controller ignores it)...
    h.client.startActivity();
    h.client.endActivity();
    h.client.cancelReply();
    await h.serverSends(started, audio('a1'));
    // ...but once a new question starts, the rest of it is dropped.
    h.client.startActivity();
    await h.serverSends(audio('a2'), completed);
    h.client.endActivity();
    await h.serverSends(started, audio('b1'), completed);

    assert.deepEqual(h.seen, ['audio:a1', 'audio:b1', 'done']);
  } finally {
    h.close();
  }
});

test('while the key is held, the latest reply waits for release', async () => {
  const h = await connect();
  try {
    h.client.startActivity();
    // The agent answers at a pause, finishes, then answers again with more of the question.
    await h.serverSends(started, audio('a1'), completed, started, audio('b1'), word('Sure.'));
    assert.deepEqual(h.seen, []);
    h.client.endActivity();
    assert.deepEqual(h.seen, ['audio:b1', 'word:Sure.']);
    await h.serverSends(completed);
    assert.deepEqual(h.seen, ['audio:b1', 'word:Sure.', 'done']);
  } finally {
    h.close();
  }
});

test('a reply cut short after release is reported, and a new one is requested if none starts', async () => {
  const h = await connect();
  try {
    h.client.startActivity();
    h.client.endActivity();
    await h.serverSends(started, audio('a1'), interrupted);
    assert.deepEqual(h.seen, ['audio:a1', 'interrupted']);
    await sleep(1800);
    assert.equal(h.sent.filter((type) => type === 'reply.create').length, 1);
  } finally {
    h.close();
  }
});

test('Stop right after sending a question does not ask for a reply', async () => {
  const h = await connect();
  try {
    h.client.startActivity();
    h.client.endActivity();
    h.client.cancelReply();
    await sleep(1800);
    assert.ok(h.sent.includes('input.audio'), 'the closing silence is still sent');
    assert.ok(!h.sent.includes('reply.create'));
  } finally {
    h.close();
  }
});

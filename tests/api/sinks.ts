import http from 'node:http';
import net from 'node:net';

/** Minimal local SMTP server that keeps every message in memory (tests never contact a real mail server). */
export async function startSmtpSink() {
  const messages: { to: string[]; data: string }[] = [];
  const state = { fail: false };
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8');
    let buf = '';
    let inData = false;
    let cur = { to: [] as string[], data: '' };
    sock.write('220 sink.test ESMTP\r\n');
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(cur);
            cur = { to: [], data: '' };
            sock.write('250 OK queued\r\n');
          } else cur.data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-sink.test\r\n250 8BITMIME\r\n');
        else if (cmd === 'HELO' || cmd === 'MAIL' || cmd === 'RSET' || cmd === 'NOOP') sock.write('250 OK\r\n');
        else if (cmd === 'RCPT') {
          if (state.fail) sock.write('451 4.3.0 Try again later\r\n');
          else {
            cur.to.push(line.match(/<([^>]*)>/)?.[1] ?? '');
            sock.write('250 OK\r\n');
          }
        } else if (cmd === 'DATA') {
          inData = true;
          sock.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          sock.write('221 Bye\r\n');
          sock.end();
        } else sock.write('502 Command not implemented\r\n');
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  return {
    url: `smtp://127.0.0.1:${port}`,
    messages,
    state,
    /** Message body with quoted-printable soft breaks and escapes decoded. */
    text: (m: { data: string }) => m.data.replace(/=\n/g, '').replace(/(=[0-9A-F]{2})+/g, (run) => Buffer.from(run.replace(/=/g, ''), 'hex').toString('utf8')),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Local HTTP receiver for webhook deliveries. */
export async function startReceiver() {
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  const state = { status: 200 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(state.status, { 'content-type': 'text/plain' }).end(state.status === 200 ? 'ok' : 'receiver is down');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    state,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

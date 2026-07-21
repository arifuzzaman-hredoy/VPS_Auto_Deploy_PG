import { createServer } from 'node:net';

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

export async function findAvailablePort(start = 20000, end = 29999): Promise<number> {
  const first = Math.max(1024, start);
  for (let port = first; port <= end; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No available host port found between ${first} and ${end}.`);
}

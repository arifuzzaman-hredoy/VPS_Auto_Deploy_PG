import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';

export type GeneratedSshKeyPair = {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
};

function uint32(value: number): Buffer {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value >>> 0, 0);
  return output;
}

function sshString(value: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return Buffer.concat([uint32(bytes.length), bytes]);
}

function armorPrivateKey(payload: Buffer): string {
  const body = payload.toString('base64');
  const lines = body.match(/.{1,70}/g) ?? [];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/**
 * Generates a real Ed25519 key pair in OpenSSH format without shelling out to
 * ssh-keygen. The private key is suitable for Git/SSH and must never be sent
 * to the browser; callers should encrypt it before persistence.
 */
export function generateOpenSshEd25519KeyPair(comment: string): GeneratedSshKeyPair {
  const normalizedComment = comment.replace(/[\r\n\0]/g, '-').slice(0, 120);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });

  // RFC 8410 Ed25519 SPKI/PKCS8 values end in the 32-byte public key/seed.
  const publicRaw = publicDer.subarray(-32);
  const privateSeed = privateDer.subarray(-32);
  if (publicRaw.length !== 32 || privateSeed.length !== 32) {
    throw new Error('Unexpected Ed25519 key encoding returned by Node.js');
  }

  const keyType = Buffer.from('ssh-ed25519', 'ascii');
  const publicBlob = Buffer.concat([sshString(keyType), sshString(publicRaw)]);

  const checkInt = randomBytes(4).readUInt32BE(0);
  let privateBlock = Buffer.concat([
    uint32(checkInt),
    uint32(checkInt),
    sshString(keyType),
    sshString(publicRaw),
    sshString(Buffer.concat([privateSeed, publicRaw])),
    sshString(normalizedComment),
  ]);

  // OpenSSH private-key format uses deterministic 1,2,3... padding to an
  // 8-byte boundary for the unencrypted "none" cipher.
  const blockSize = 8;
  const paddingLength = blockSize - (privateBlock.length % blockSize);
  const padding = Buffer.alloc(paddingLength);
  for (let index = 0; index < paddingLength; index += 1) {
    padding[index] = index + 1;
  }
  privateBlock = Buffer.concat([privateBlock, padding]);

  const privatePayload = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'ascii'),
    sshString('none'),
    sshString('none'),
    sshString(Buffer.alloc(0)),
    uint32(1),
    sshString(publicBlob),
    sshString(privateBlock),
  ]);

  const fingerprint = `SHA256:${createHash('sha256')
    .update(publicBlob)
    .digest('base64')
    .replace(/=+$/g, '')}`;

  return {
    publicKey: `ssh-ed25519 ${publicBlob.toString('base64')} ${normalizedComment}`,
    privateKey: armorPrivateKey(privatePayload),
    fingerprint,
  };
}

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Helper to resolve and parse the Apple Private Key (PEM/p8)
export function getPrivateKey() {
  let privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("APPLE_PRIVATE_KEY is missing from environment variables.");
  }
  
  // If it's a file path, load it from disk
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      const resolvedPath = path.resolve(privateKey);
      return fs.readFileSync(resolvedPath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read private key from file path "${privateKey}": ${err.message}`);
    }
  }
  
  // Otherwise, treat it as a direct PEM string and replace escaped newlines
  return privateKey.replace(/\\n/g, '\n');
}

// Generate short-lived Developer Token (JWT signed with ES256)
export function generateDeveloperToken(expiresIn = '5m') {
  const privateKey = getPrivateKey();
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!keyId || !teamId) {
    throw new Error("Missing APPLE_KEY_ID or APPLE_TEAM_ID in environment variables.");
  }

  // Apple Music developer JWT specification
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: expiresIn,
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId
    }
  });
}

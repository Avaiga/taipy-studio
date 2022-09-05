export function getNonce() {
    const crypto = require('crypto');
    return crypto?.randomBytes(16).toString('base64');
}

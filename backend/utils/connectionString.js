// Keeps the password inside a connection string (mongodb://user:password@host/db) on the server.
const MASK = '****';

const parse = (uri) => {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)(.*)$/is.exec(String(uri));
  if (!match) return null;
  const [, scheme, rest] = match;
  // The last @ ends the credentials, so a password containing @ is still treated as a password
  const at = rest.lastIndexOf('@');
  if (at < 0) return { scheme, username: null, password: null, tail: rest };
  const credentials = rest.slice(0, at);
  const colon = credentials.indexOf(':');
  return {
    scheme,
    username: colon < 0 ? credentials : credentials.slice(0, colon),
    password: colon < 0 ? null : credentials.slice(colon + 1),
    tail: rest.slice(at + 1),
  };
};

const hostsOf = (tail) => tail.split(/[/?]/)[0].toLowerCase();

const maskConnectionString = (uri) => {
  if (!uri) return uri;
  const parts = parse(uri);
  // Not a URL we understand: hide it completely if it could hold credentials
  if (!parts) return String(uri).includes('@') ? MASK : uri;
  if (parts.password === null) return uri;
  return `${parts.scheme}${parts.username}:${MASK}@${parts.tail}`;
};

const isMasked = (uri) => {
  if (!uri) return false;
  if (uri === MASK) return true;
  return parse(uri)?.password === MASK;
};

// Puts the saved password back when a form returns a masked string. Refuses a changed host,
// because that would send the saved password to whatever server was typed in.
const restoreMaskedPassword = (submitted, stored) => {
  if (!isMasked(submitted)) return { value: submitted };
  const reenter = { error: 'Please enter the password again to change this connection string.' };
  if (!stored) return reenter;
  if (submitted === MASK) return { value: stored };

  const next = parse(submitted);
  const saved = parse(stored);
  if (!saved || saved.password === null) return reenter;
  if (hostsOf(next.tail) !== hostsOf(saved.tail)) {
    return { error: 'Please enter the password again when changing the host.' };
  }
  return { value: `${next.scheme}${next.username}:${saved.password}@${next.tail}` };
};

module.exports = { MASK, isMasked, maskConnectionString, restoreMaskedPassword };

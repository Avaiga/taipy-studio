export const getNonce = () => {
  const crypto = require("crypto");
  return crypto?.randomBytes(16).toString("base64");
};

export const configFileExt = ".toml";
export const configFilePattern = `**/*${configFileExt}`;

export const getCspScriptSrc = (nonce: string) => {
  return (
    "'nonce-" +
    nonce +
    "'" +
    (process.env.NODE_ENV == "development" ? " 'unsafe-eval'" : "")
  );
};

export const textUriListMime = "text/uri-list";
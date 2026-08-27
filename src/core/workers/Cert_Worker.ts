import forge from "node-forge";
import { randomBytes } from "crypto";

const SHARED_KEYS = forge.pki.rsa.generateKeyPair(2048);
const SHARED_PUB_KEY = SHARED_KEYS.publicKey;
const SHARED_PRIV_KEY_PEM = forge.pki.privateKeyToPem(SHARED_KEYS.privateKey);

let cachedCaCert: forge.pki.Certificate | null = null;
let cachedCaKey: forge.pki.rsa.PrivateKey | null = null;
let lastCaFingerprint = "";

interface WorkerPayload {
  host: string;
  caConfig: { cert: string | Buffer; key: string | Buffer };
}

export default ({ host, caConfig }: WorkerPayload) => {
  const caCertPem = caConfig.cert.toString("utf-8");
  const caKeyPem = caConfig.key.toString("utf-8");

  const currentFingerprint =
    caCertPem.length.toString() + caKeyPem.length.toString();

  if (
    lastCaFingerprint !== currentFingerprint ||
    !cachedCaCert ||
    !cachedCaKey
  ) {
    cachedCaCert = forge.pki.certificateFromPem(caCertPem);
    cachedCaKey = forge.pki.privateKeyFromPem(
      caKeyPem,
    ) as forge.pki.rsa.PrivateKey;
    lastCaFingerprint = currentFingerprint;
  }

  const isIPv6 = host.includes(":");
  const isIPv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host);
  const isIP = isIPv4 || isIPv6;
  const cleanedHost = host.replace(/[[\]]/g, "").toLowerCase();

  const cert = forge.pki.createCertificate();
  cert.serialNumber = randomBytes(16).toString("hex");

  cert.validity.notBefore = new Date();
  cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  cert.setSubject([{ name: "commonName", value: cleanedHost }]);
  cert.setIssuer(cachedCaCert.subject.attributes);
  cert.publicKey = SHARED_PUB_KEY;

  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true, clientAuth: false },
    {
      name: "subjectAltName",
      altNames: [
        {
          type: isIP ? 7 : 2,
          [isIP ? "ip" : "value"]: cleanedHost,
        },
      ],
    },
    {
      name: "authorityKeyIdentifier",
      keyIdentifier: true,
      authorityCertIssuer: true,
      serialNumber: cachedCaCert.serialNumber,
    },
    { name: "subjectKeyIdentifier" },
  ]);

  cert.sign(cachedCaKey, forge.md.sha256.create());

  const leafCertPem = forge.pki.certificateToPem(cert);

  return {
    cert: Buffer.from(leafCertPem, "utf-8"),
    key: Buffer.from(SHARED_PRIV_KEY_PEM, "utf-8"),
  };
};

import forge from "node-forge";

/**
 * Generates a self-signed certificate and private key in memory using node-forge.
 * Returns them as standard PEM strings ready for Node's https/tls modules.
 */
export function generateForgeCertificates(): { key: string; cert: string } {
  // 1. Generate a 2048-bit RSA key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // 2. Create the certificate object
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";

  // Set validity (Valid from now until 1 year from now)
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  // 3. Define the Subject and Issuer (Self-signed so they are the same)
  const attrs = [
    { name: "commonName", value: "localhost" },
    { name: "organizationName", value: "MITM Proxy Test Suite" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // 4. Set Standard Extensions (Defining this as a server cert)
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" }, // DNS
        { type: 7, ip: "127.0.0.1" }, // IP
      ],
    },
  ]);

  // 5. Sign the certificate with the private key
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // 6. Convert both to PEM strings
  const pemCert = forge.pki.certificateToPem(cert);
  const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

  return { key: pemKey, cert: pemCert };
}

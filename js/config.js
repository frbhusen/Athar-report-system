/*
 * أثر Report Hub - accounts.
 * One account per section. Passwords are stored as SHA-256 hashes (hex), never plain text.
 * To change a password: open tools/hash.html in a browser, type the new password,
 * and paste the resulting hash into the "hash" field below.
 *
 * NOTE: front-end-only login is NOT real security. Anyone can read this file.
 * It only keeps the sections separate for convenience.
 */
window.ATHAR_CONFIG = {
  appName: 'أثر Report Hub',
  accounts: [
    { section: 'media', email: 'media@athar.local', hash: '886aa0a3496855b38818bb515654cf65d7bd50a31d76aa0028572693a48f735b' },
    { section: 'logistics', email: 'logistics@athar.local', hash: 'a949282ba20458e0a3ef0995a3ab63d7ff46c133f224caf10ee64dee6e02351b' },
    { section: 'executive', email: 'executive@athar.local', hash: '72ec9b84e7b6cb4ae4facbd40d7db199c36c6eaf4780e52e27deab1d8ec66a85' },
    { section: 'finance', email: 'finance@athar.local', hash: '9cc1ab36f3e0a3540859e7476846bae8eaa58251fc9eae635237f1409a97e905' },
    { section: 'tech', email: 'tech@athar.local', hash: '6dce091fbf655a5feb74d634c46900d128c90193738db5e10bdb372566f817eb' },
    { section: 'hr', email: 'hr@athar.local', hash: 'eb55c7ddc56d93625605369da436db5826d50d8620e6024b65ba4af449987966' },
    { section: 'coordinator', email: 'coordinator@athar.local', hash: 'adbf76eb498f81ec20cda321003768b1f2aca0e22d154ba6637ae1ca99dd1be2' },
  ],
};

const settings = require('../settings');
const { isSudo, normalizeId } = require('./index');

async function isOwner(senderId) {
  const ownerNum = normalizeId(settings.ownerNumber);
  const senderNum = normalizeId(senderId);
  if (ownerNum && senderNum && ownerNum === senderNum) return true;
  try {
    return await isSudo(senderId);
  } catch {
    return false;
  }
}

module.exports = isOwner;

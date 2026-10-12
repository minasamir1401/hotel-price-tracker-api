export function normalizeArabicText(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[\-–—_,/\\()[\]{}،.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function roomNameMatches(candidateName, targetRoomName) {
  if (!targetRoomName) return true;
  if (!candidateName) return false;
  const cNorm = normalizeArabicText(candidateName);
  const tNorm = normalizeArabicText(targetRoomName);
  if (!cNorm || !tNorm) return false;
  if (cNorm === tNorm) return true;
  if (cNorm.includes(tNorm) || tNorm.includes(cNorm)) return true;
  const stopWords = new Set(['في', 'من', 'على', 'مع', 'أو', 'او', 'عبر', 'الى', 'إلى', 'و']);
  const tWords = tNorm.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
  if (tWords.length > 0 && tWords.every(w => cNorm.includes(w))) return true;
  const cWords = cNorm.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
  if (cWords.length > 0 && cWords.every(w => tNorm.includes(w))) return true;
  return false;
}

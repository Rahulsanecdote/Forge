function compact(value: string) {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '');
}

export function findBannedPhraseViolations(value: string, bannedPhrases: string[]) {
  const text = value.toLocaleLowerCase();
  const compactText = compact(value);
  return bannedPhrases.filter((phrase) => {
    const normalizedPhrase = phrase.toLocaleLowerCase();
    const compactPhrase = compact(phrase);
    return text.includes(normalizedPhrase) || (compactPhrase.length > 0 && compactText.includes(compactPhrase));
  });
}

export const SUCCESS_PHRASES = [
  "thank you",
  "success",
  "received",
  "we will contact you",
  "message sent",
  "been sent",
];

export function isSubmissionSuccessText(text) {
  const t = String(text).toLowerCase();
  return SUCCESS_PHRASES.some((phrase) => t.includes(phrase));
}

export function computeSignals({
  networkOk = false,
  urlChanged = false,
  formGone = false,
  happyText = false,
  isThankYouPage = false,
} = {}) {
  const signals = { networkOk, urlChanged, formGone, happyText, isThankYouPage };
  const submitted = Object.values(signals).some(Boolean);
  const confidence = Object.values(signals).filter(Boolean).length;
  return { submitted, confidence, signals };
}

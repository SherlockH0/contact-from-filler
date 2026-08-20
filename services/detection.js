export const SUCCESS_PHRASES = [
  "thank you for contacting",
  "thank you for your message",
  "thank you for reaching out",
  "thank you for your inquiry",
  "your message has been sent",
  "your message has been submitted",
  "your message was sent",
  "your message was submitted",
  "we have received your message",
  "we have received your inquiry",
  "we received your",
  "form submitted successfully",
  "submission successful",
  "successfully submitted",
  "your request has been submitted",
  "we will get back to you",
  "we'll get back to you shortly",
  "we will contact you",
  "message sent successfully",
  "message sent",
  "thank you",
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

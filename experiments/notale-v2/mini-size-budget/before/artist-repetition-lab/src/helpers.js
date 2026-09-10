function isMobile() {
  const bp = '(min-width: 768px)';
  return !window.matchMedia(bp).matches;
}

export { isMobile };

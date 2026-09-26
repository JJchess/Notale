import classic from "../themes/classic.js";

// This sample uses the original classic theme and its CSS-variable overrides.
const styles = Object.keys(classic)
  .map(key => `--${key}: var(--xd-${key}, ${classic[key]})`).join(';');
export default { classic: styles };

const BACKGROUND = new Set([
  'background',
  'background-color',
  'background-image',
  'fill',
]);

const isBorderish = property =>
  property.startsWith('border') ||
  property.startsWith('outline') ||
  property === 'scrollbar-color';

/**
 * @param {string} property CSS property (kebab-case) or a style-object key
 * @param {string} varName custom property name including the leading `--`
 * @returns {string | null} a message when the pair is a violation
 */
export function classifyTokenUse(property, varName) {
  if (property.startsWith('--')) return null;
  const prop = property.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

  if (/^--surface-[1-4]$/.test(varName) || /^--line-[1-3]$/.test(varName)) {
    return `${varName} is a ramp step; only the tokens file writes it. Use a role (--card, --border) instead.`;
  }
  if (varName.startsWith('--text-')) {
    return prop === 'color' ? null : `${varName}: --text-* is for color only.`;
  }
  if (varName.startsWith('--fill-')) {
    return prop === 'color'
      ? `${varName}: --fill-* is never a text colour; use --text-${varName.slice(7)}.`
      : null;
  }
  if (varName.startsWith('--surface-')) {
    return BACKGROUND.has(prop)
      ? null
      : `${varName}: --surface-* is for background and fill only.`;
  }
  if (varName.startsWith('--border-') || varName === '--border') {
    return isBorderish(prop)
      ? null
      : `${varName}: --border-* is for border and outline properties only.`;
  }
  return null;
}

export const VAR_PATTERN = /var\(\s*(--[a-zA-Z0-9-]+)/g;

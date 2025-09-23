(function (global) {
  'use strict';

  const REGION_KEYS = ['us', 'eu', 'pac', 'meta'];
  const REGION_SET = new Set(REGION_KEYS);
  const PREFIX_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  const sanitizePrefix = (value) => String(value || '').trim().toLowerCase();

  const isValidPrefix = (value) => PREFIX_REGEX.test(String(value || '').trim().toLowerCase());

  const isValidRegion = (value) => REGION_SET.has(String(value || '').toLowerCase());

  const derivePrefixFromUrl = (url) => {
    try {
      const u = new URL(String(url || ''));
      const match = u.hostname.match(/^([a-z0-9-]+)\.([a-z]+)\.nexthink\.cloud$/i);
      if (match) return match[1].toLowerCase();
      return '';
    } catch (_) { return ''; }
  };

  const deriveRegionFromUrl = (url) => {
    try {
      const u = new URL(String(url || ''));
      const match = u.hostname.match(/^([a-z0-9-]+)\.([a-z]+)\.nexthink\.cloud$/i);
      if (match) {
        const reg = match[2].toLowerCase();
        return isValidRegion(reg) ? reg : '';
      }
      return '';
    } catch (_) { return ''; }
  };

  const buildUrlFromParts = (prefix, region) => {
    const p = sanitizePrefix(prefix);
    const r = String(region || '').toLowerCase();
    if (!isValidPrefix(p) || !isValidRegion(r)) return '';
    return `https://${p}.${r}.nexthink.cloud`;
  };

  global.NqaInstanceUtils = {
    REGION_KEYS,
    REGION_SET,
    sanitizePrefix,
    isValidPrefix,
    isValidRegion,
    derivePrefixFromUrl,
    deriveRegionFromUrl,
    buildUrlFromParts,
  };
})(typeof window !== 'undefined' ? window : this);


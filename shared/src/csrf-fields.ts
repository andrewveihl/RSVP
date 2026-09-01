/**
 * The names of the CSRF cookie, header and form field.
 *
 * These live apart from `csrf.ts` because both sides need them and only one side can
 * have `node:crypto`: every form in both apps renders `<input name={CSRF_FIELD}>` in
 * the browser bundle, and importing the signing module to get that one string would
 * drag `node:crypto` into client-side code, where it does not exist.
 *
 * Nothing here is a secret -- they are field names, visible in the page's HTML.
 */

export const CSRF_COOKIE = 'rsvp_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_FIELD = 'csrf_token';

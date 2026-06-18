import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePassword, validateUsername } from "./credentials.js";

test("validatePassword: accepts a strong-enough password", () => {
  assert.deepEqual(validatePassword("hunter2pass"), { ok: true });
});

test("validatePassword: rejects short / missing letter / missing digit / oversized", () => {
  assert.equal(validatePassword("ab1").reason, "TOO_SHORT");
  assert.equal(validatePassword("12345678").reason, "NEEDS_LETTER");
  assert.equal(validatePassword("abcdefgh").reason, "NEEDS_DIGIT");
  assert.equal(validatePassword("a1" + "x".repeat(200)).reason, "TOO_LONG");
  assert.equal(validatePassword(12345678 as unknown).reason, "INVALID");
});

test("validateUsername: accepts valid handles", () => {
  for (const u of ["njeri", "wanjiru.ke", "trader_01", "abc"]) assert.deepEqual(validateUsername(u), { ok: true });
});

test("validateUsername: rejects bad length / charset / edge dots", () => {
  assert.equal(validateUsername("ab").reason, "TOO_SHORT");
  assert.equal(validateUsername("x".repeat(21)).reason, "TOO_LONG");
  assert.equal(validateUsername(".njeri").reason, "INVALID_CHARS");   // leading dot
  assert.equal(validateUsername("njeri_").reason, "INVALID_CHARS");   // trailing underscore
  assert.equal(validateUsername("a b").reason, "INVALID_CHARS");      // space
  assert.equal(validateUsername("hac@ker").reason, "INVALID_CHARS");  // symbol
});

import { validateFullName, validateDateOfBirth, ageInYears } from "./credentials.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");

test("ageInYears: calendar-correct whole years (UTC)", () => {
  assert.equal(ageInYears("2000-06-18", NOW), 26);   // birthday today
  assert.equal(ageInYears("2000-06-19", NOW), 25);   // birthday tomorrow → not yet
});

test("validateDateOfBirth: exact-18 passes, 1 day short fails, format/date/future/implausible", () => {
  assert.equal(validateDateOfBirth("2008-06-18", NOW).ok, true);          // exactly 18
  assert.equal(validateDateOfBirth("2008-06-19", NOW).reason, "UNDERAGE"); // 1 day short of 18
  assert.equal(validateDateOfBirth("2027-01-01", NOW).reason, "FUTURE");
  assert.equal(validateDateOfBirth("not-a-date", NOW).reason, "INVALID_FORMAT");
  assert.equal(validateDateOfBirth("2000-02-30", NOW).reason, "INVALID_DATE"); // not a real day
  assert.equal(validateDateOfBirth("1850-01-01", NOW).reason, "IMPLAUSIBLE");
});

test("validateFullName: bounds + charset", () => {
  assert.equal(validateFullName("Jane Doe").ok, true);
  assert.equal(validateFullName("O'Brien-Smith").ok, true);
  assert.equal(validateFullName("J").reason, "TOO_SHORT");
  assert.equal(validateFullName("123").reason, "INVALID_CHARS");
});

import { validateReferralCode, REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from "./credentials.js";

test("validateReferralCode: normalizes (trim + upper) and accepts the canonical alphabet", () => {
  const r = validateReferralCode("  4u7vrsca  ");
  assert.deepEqual(r, { ok: true, code: "4U7VRSCA" });
  // every alphabet character is accepted in a full-length code
  const full = REFERRAL_CODE_ALPHABET.slice(0, REFERRAL_CODE_LENGTH);
  assert.equal(validateReferralCode(full).ok, true);
});

test("validateReferralCode: rejects wrong length, ambiguous/illegal chars, and non-strings", () => {
  assert.equal((validateReferralCode("ABC123") as { reason: string }).reason, "INVALID_LENGTH"); // 6 chars
  assert.equal((validateReferralCode("ABCDEFGHI") as { reason: string }).reason, "INVALID_LENGTH"); // 9 chars
  assert.equal((validateReferralCode("4U7VRSC0") as { reason: string }).reason, "INVALID_CHARS"); // 0 is excluded
  assert.equal((validateReferralCode("4U7VRSCI") as { reason: string }).reason, "INVALID_CHARS"); // I is excluded
  assert.equal((validateReferralCode("4U7VRS-A") as { reason: string }).reason, "INVALID_CHARS"); // hyphen
  assert.equal((validateReferralCode(12345678 as unknown) as { reason: string }).reason, "INVALID");
});

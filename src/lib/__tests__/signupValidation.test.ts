import { describe, it, expect } from "vitest";
import {
  validateStep1, validateStep2, firstErrorKey, STEP1_ORDER, STEP2_ORDER,
} from "@/lib/signupValidation";

const baseStep1 = {
  email: "queen@crownme.com",
  password: "Sup3rRoyal!",
  confirmPassword: "Sup3rRoyal!",
  username: "queenbee",
  passwordScore: 3,
  usernameStatus: "available" as const,
};

const baseStep2 = {
  first_name: "Jane",
  last_name: "Doe",
  dob: "1995-06-15",
  gender: "female",
  country: "United States",
  state: "GA",
  city: "Atlanta",
  policiesOk: true,
};

describe("validateStep1 — Account", () => {
  it("passes with valid input", () => {
    expect(validateStep1(baseStep1)).toEqual({});
  });
  it("flags missing/invalid email", () => {
    expect(validateStep1({ ...baseStep1, email: "" }).email).toBe("Enter your email");
    expect(validateStep1({ ...baseStep1, email: "nope" }).email).toBe("Enter a valid email");
  });
  it("flags weak/short password", () => {
    expect(validateStep1({ ...baseStep1, password: "abc" }).password).toBeTruthy();
    expect(validateStep1({ ...baseStep1, passwordScore: 0 }).password).toBe("Choose a stronger password");
  });
  it("flags non-matching confirm", () => {
    expect(validateStep1({ ...baseStep1, confirmPassword: "Other1234!" }).confirmPassword).toBe("Passwords don't match");
  });
  it("flags reserved/taken username", () => {
    expect(validateStep1({ ...baseStep1, username: "admin", usernameStatus: "idle" }).username).toBe("That username is reserved");
    expect(validateStep1({ ...baseStep1, username: "accountrecovery", usernameStatus: "idle" }).username).toBe("That username is reserved");
    expect(validateStep1({ ...baseStep1, usernameStatus: "taken" }).username).toBe("That username is already taken");
  });
});

describe("validateStep2 — Profile", () => {
  it("passes with valid input", () => {
    expect(validateStep2(baseStep2)).toEqual({});
  });
  it("flags underage DOB", () => {
    const today = new Date();
    const dob = `${today.getFullYear() - 10}-01-01`;
    expect(validateStep2({ ...baseStep2, dob }).dob).toBe("You must be 18 or older");
  });
  it("flags missing required profile fields", () => {
    const e = validateStep2({ ...baseStep2, first_name: "", country: "", city: "" });
    expect(e.first_name).toBeTruthy();
    expect(e.country).toBeTruthy();
    expect(e.city).toBeTruthy();
  });
  it("flags missing policies", () => {
    expect(validateStep2({ ...baseStep2, policiesOk: false }).policies).toBeTruthy();
  });
});

describe("firstErrorKey — focus order", () => {
  it("returns first matching key by step order", () => {
    const errs = { username: "x", email: "y" };
    expect(firstErrorKey(errs, STEP1_ORDER)).toBe("email");
  });
  it("respects step 2 order (policies last)", () => {
    const errs = { policies: "x", first_name: "y" };
    expect(firstErrorKey(errs, STEP2_ORDER)).toBe("first_name");
  });
  it("returns null with no errors", () => {
    expect(firstErrorKey({}, STEP1_ORDER)).toBeNull();
  });
});

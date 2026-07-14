// Pure validators for the signup flow. Kept framework-free so they're
// trivial to unit test and reusable across steps.
import { calculateAge } from "@/lib/crown";
import { isReservedUsername } from "@/lib/reservedUsernames";

export type SignupErrors = Partial<Record<
  | "email" | "password" | "confirmPassword" | "username"
  | "first_name" | "last_name" | "dob" | "gender"
  | "country" | "state" | "city" | "policies",
  string
>>;

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

export interface Step1Input {
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
  passwordScore: number; // 0-4
  usernameStatus: UsernameStatus;
}

export interface Step2Input {
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  country: string;
  state: string;
  city: string;
  policiesOk: boolean;
}

export const STEP1_ORDER: (keyof SignupErrors)[] = [
  "email", "password", "confirmPassword", "username",
];

export const STEP2_ORDER: (keyof SignupErrors)[] = [
  "first_name", "last_name", "dob", "gender", "country", "state", "city", "policies",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStep1(input: Step1Input): SignupErrors {
  const errs: SignupErrors = {};
  const email = input.email.trim();
  if (!email) errs.email = "Enter your email";
  else if (!EMAIL_RE.test(email) || email.length > 255) errs.email = "Enter a valid email";

  if (!input.password) errs.password = "Choose a password";
  else if (input.password.length < 8) errs.password = "At least 8 characters";
  else if (input.passwordScore < 2) errs.password = "Choose a stronger password";

  if (!input.confirmPassword) errs.confirmPassword = "Confirm your password";
  else if (input.password !== input.confirmPassword) errs.confirmPassword = "Passwords don't match";

  const u = input.username.trim().toLowerCase();
  if (!u) errs.username = "Pick a username";
  else if (!/^[a-z0-9_.]{3,24}$/.test(u)) errs.username = "3–24 chars · letters, numbers, _ .";
  else if (isReservedUsername(u)) errs.username = "That username is reserved";
  else if (input.usernameStatus === "reserved") errs.username = "That username is reserved";
  else if (input.usernameStatus === "invalid") errs.username = "That username isn't allowed";
  else if (input.usernameStatus === "taken") errs.username = "That username is already taken";
  else if (input.usernameStatus === "checking") errs.username = "Checking availability…";

  return errs;
}

export function validateStep2(input: Step2Input): SignupErrors {
  const errs: SignupErrors = {};
  if (!input.first_name.trim()) errs.first_name = "Required";
  if (!input.last_name.trim()) errs.last_name = "Required";

  if (!input.dob) errs.dob = "Enter your date of birth";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) errs.dob = "Invalid date";
  else if (calculateAge(input.dob) < 18) errs.dob = "You must be 18 or older";

  if (!input.gender) errs.gender = "Select a gender";
  if (!input.country) errs.country = "Select your country";
  if (!input.state.trim()) errs.state = "Required";
  if (!input.city.trim()) errs.city = "Required";
  if (!input.policiesOk) errs.policies = "Please accept the policies to continue";

  return errs;
}

export function firstErrorKey(
  errs: SignupErrors,
  order: (keyof SignupErrors)[],
): keyof SignupErrors | null {
  for (const k of order) if (errs[k]) return k;
  return null;
}

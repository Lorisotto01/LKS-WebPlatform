/** Live password-strength rules shared by Register and Reset password. */
export interface PasswordCheck {
  label: string;
  test: (v: string) => boolean;
}

export const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: "Almeno 8 caratteri", test: (v) => v.length >= 8 },
  { label: "Una maiuscola", test: (v) => /[A-Z]/.test(v) },
  { label: "Un numero", test: (v) => /[0-9]/.test(v) },
  { label: "Un carattere speciale", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** True only when every rule passes. */
export function isPasswordValid(v: string): boolean {
  return PASSWORD_CHECKS.every((c) => c.test(v));
}

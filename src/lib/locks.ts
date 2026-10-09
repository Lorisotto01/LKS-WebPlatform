/**
 * Tipi di blocco del dispositivo (v5.0.0, task 869fbc80b).
 *
 * Fino alla 4.x si chiamavano ENV_LOCK / PERMANENT_LOCK, con codici interni
 * "env" / "perm". Le DesktopApp 4.x ancora installate aprono /checkout?lock=env|perm:
 * normalizeLockType li converte, così i loro link continuano a funzionare.
 */
export type LockType = "integrity" | "security";

export const LOCK_LABEL: Record<LockType, string> = {
  integrity: "INTEGRITY_LOCK",
  security: "SECURITY_LOCK",
};

/** Codice 5.0 da un valore qualsiasi (anche legacy "env"/"perm"); null se non riconosciuto. */
export function normalizeLockType(v: string | null | undefined): LockType | null {
  switch (v) {
    case "integrity":
    case "env":
      return "integrity";
    case "security":
    case "perm":
      return "security";
    default:
      return null;
  }
}

/** Etichetta leggibile; i valori non riconosciuti finiscono su SECURITY_LOCK come il default storico. */
export function lockLabel(v: string | null | undefined): string {
  return LOCK_LABEL[normalizeLockType(v) ?? "security"];
}

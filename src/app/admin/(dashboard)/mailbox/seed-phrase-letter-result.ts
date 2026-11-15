// What happened to the founder's letter, in words. A plain module (no "use client") so
// it can be tested on its own; type-only imports, because letters.ts and contact-info.ts
// are server code and a value import would pull them into the client bundle.
import type { SubmitLetterResult } from "@/lib/letters";
import type { ContactInfoKind } from "@/lib/safety/contact-info";

const CONTACT_KIND_LABELS: Record<ContactInfoKind, string> = {
  email: "un correo",
  phone: "un teléfono",
  url: "un enlace",
  handle: "un usuario de red social",
};

type NotAllowedReason = Extract<SubmitLetterResult, { type: "not_allowed" }>["reason"];

const NOT_ALLOWED_MESSAGES: Record<NotAllowedReason, string> = {
  closed: "La correspondencia ya está cerrada.",
  awaiting_review: "Ya hay una carta esperando revisión en esta correspondencia.",
  not_your_turn: "Ahora no te toca escribir.",
};

// Only "held" means the letter was sent.
export function describeSeedPhraseLetterResult(result: SubmitLetterResult): string {
  switch (result.type) {
    case "held":
      return "Enviada. Espera tu revisión en Letters: entrégala desde ahí.";
    case "crisis":
      return "No se envió: la moderación la marcó como crisis.";
    case "rejected":
      if (result.reason === "contact_info") {
        const kinds = result.contactKinds.map((kind) => CONTACT_KIND_LABELS[kind]).join(", ");
        return `No se envió: tiene datos de contacto (${kinds}). Quítalos y vuelve a enviarla.`;
      }
      return "No se envió: la moderación la rechazó.";
    case "not_allowed":
      return `No se envió. ${NOT_ALLOWED_MESSAGES[result.reason]}`;
    case "not_found":
      return "No se envió: esta correspondencia no es de una frase semilla tuya.";
  }
}

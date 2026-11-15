import { describe, expect, it } from "vitest";
import type { SubmitLetterResult } from "@/lib/letters";
import { describeSeedPhraseLetterResult } from "./seed-phrase-letter-result";

describe("describeSeedPhraseLetterResult", () => {
  it.each<[SubmitLetterResult, string]>([
    [{ type: "held" }, "Enviada. Espera tu revisión en Letters: entrégala desde ahí."],
    [{ type: "crisis", resourceUrl: "/es/help" }, "No se envió: la moderación la marcó como crisis."],
    [{ type: "rejected", reason: "moderation" }, "No se envió: la moderación la rechazó."],
    [
      { type: "rejected", reason: "contact_info", contactKinds: ["email", "phone", "url", "handle"] },
      "No se envió: tiene datos de contacto (un correo, un teléfono, un enlace, un usuario de red social). Quítalos y vuelve a enviarla.",
    ],
    [{ type: "not_allowed", reason: "closed" }, "No se envió. La correspondencia ya está cerrada."],
    [
      { type: "not_allowed", reason: "awaiting_review" },
      "No se envió. Ya hay una carta esperando revisión en esta correspondencia.",
    ],
    [{ type: "not_allowed", reason: "not_your_turn" }, "No se envió. Ahora no te toca escribir."],
    [{ type: "not_found" }, "No se envió: esta correspondencia no es de una frase semilla tuya."],
  ])("%j → %s", (result, message) => {
    expect(describeSeedPhraseLetterResult(result)).toBe(message);
  });
});

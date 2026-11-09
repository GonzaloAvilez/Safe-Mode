import { describe, expect, it } from "vitest";
import { detectContactInfo } from "@/lib/safety/contact-info";

describe("detectContactInfo — catches contact identifiers", () => {
  it.each([
    ["plain email", "escríbeme a juan.perez@gmail.com", "email"],
    ["email with accented local part", "josé@correo.mx", "email"],
    ["obfuscated email (ES)", "juan arroba gmail punto com", "email"],
    ["obfuscated email (EN, brackets)", "juan (at) gmail [dot] com", "email"],
    ["fullwidth email", "ｊｕａｎ＠ｇｍａｉｌ．ｃｏｍ", "email"],
    ["email split by zero-width chars", "juan​@gmail‌.com", "email"],
    ["email with spaces around symbols", "juan @ gmail . com", "email"],
    ["email with a space after @", "juan@ gmail.com", "email"],
    ["obfuscated @ with a real dot", "juan.perez(arroba)gmail.com", "email"],
    ["https URL", "mira https://example.org/mi-perfil", "url"],
    ["www URL", "entra a www.mipagina.es", "url"],
    ["bare domain", "busca mipagina.com", "url"],
    ["bare Latin American domain", "está en tienda.mx", "url"],
    ["short link with path", "t.me/juanito", "url"],
    ["WhatsApp link", "wa.me/5215512345678", "url"],
    ["link-in-bio", "linktr.ee/juan", "url"],
    ["international phone", "llámame al +52 55 1234 5678", "phone"],
    ["dashed phone", "mi número es 55-1234-5678", "phone"],
    ["US phone with parentheses", "call me (555) 123-4567", "phone"],
    ["handle", "sígueme @juan_perez", "handle"],
    ["handle after platform name", "búscame en ig @juanito.99", "handle"],
    ["platform + username without @", "IG: juanito_99", "handle"],
    ["platform + 'es' + username", "mi insta es juan.perez", "handle"],
    ["platform + username (EN)", "my snapchat is lonely_wolf22", "handle"],
    ["spaced-out digits", "5 5 1 2 3 4 5 6 7 8", "phone"],
  ])("%s", (_label, text, kind) => {
    const result = detectContactInfo(text);
    expect(result.found).toBe(true);
    expect(result.kinds).toContain(kind);
  });

  it("reports every kind present", () => {
    expect(detectContactInfo("juan@gmail.com o +52 55 1234 5678 o @juan").kinds).toEqual(["email", "phone", "handle"]);
  });

  it("doesn't double-report an email's domain as a URL", () => {
    expect(detectContactInfo("juan@gmail.com").kinds).toEqual(["email"]);
  });
});

describe("detectContactInfo — leaves honest emotional writing alone", () => {
  it.each([
    "Me siento solo desde que mi papá se fue, hace ya 3 años.",
    "Borré instagram porque me hacía sentir peor.",
    "I quit WhatsApp for a month and felt lighter.",
    "Le mandé un email a mi jefe y no me contestó.",
    "Tenía 12 años y mi mamá 45 cuando pasó.",
    "Fue el 12.05.2020, nunca lo olvido.",
    "Pasó en 2019 y otra vez en 2021.",
    "Llegué a las 3.30 de la mañana.",
    "Gracias a tod@s los que leen esto.",
    "Estoy cansado, triste, etc. y no sé por qué.",
    "Me dijo el Sr.García que todo iba a estar bien.",
    "Mi vida.es dura a veces",
    "I was at home, dot dot dot, waiting.",
    "Te escribo @ las 3 de la mañana.",
    "Borré instagram porque me comparaba con todos.",
    "Mi insta era mi diario, ahora ya no.",
    "Dejé TikTok en 2023 y dormí mejor.",
    "Pasé la noche en whatsapp esperando que me escribiera.",
  ])("%j", (text) => {
    expect(detectContactInfo(text)).toEqual({ found: false, kinds: [] });
  });
});

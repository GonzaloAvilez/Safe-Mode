import { describe, expect, it } from "vitest";
import { detectContactInfo, type ContactInfoKind } from "@/lib/safety/contact-info";

// Each kind has its own pattern, so each kind gets its own cases in both languages:
// evasions it must catch, and honest emotional writing it must leave alone. A false
// positive here means an honest letter gets rejected, so "allows" matters as much as
// "detects".

function expectDetected(text: string, kind: ContactInfoKind) {
  const result = detectContactInfo(text);
  expect(result.found).toBe(true);
  expect(result.kinds).toContain(kind);
}

function expectClean(text: string) {
  expect(detectContactInfo(text)).toEqual({ found: false, kinds: [] });
}

describe("email", () => {
  describe("ES", () => {
    it.each([
      "escríbeme a juan.perez@gmail.com",
      "josé@correo.mx",
      "juan arroba gmail punto com",
      "juan @ gmail . com",
      "juan@ gmail.com",
      "juan.perez(arroba)gmail.com",
      "escríbeme: juan (arroba) gmail (punto) com",
      "mándame un correo a juan_99 arroba hotmail punto es",
    ])("detects %j", (text) => expectDetected(text, "email"));

    it.each([
      "Le mandé un email a mi jefe y no me contestó.",
      "Estaba @ casa. Luego lloré.",
      "Gracias a tod@s los que leen esto.",
      "Te escribo @ las 3 de la mañana.",
      "Estaba en casa, punto. No quiero hablar.",
    ])("allows %j", expectClean);
  });

  describe("EN", () => {
    it.each([
      "email me at john.smith@outlook.com",
      "john at gmail dot com",
      "john (at) gmail (dot) com",
      "john [at] gmail [dot] com",
      "john at gmail.com",
      "johnny_b @ yahoo . com",
      "email: jane_doe at proton dot me",
    ])("detects %j", (text) => expectDetected(text, "email"));

    it.each([
      "I was at home. Then I cried.",
      "I looked at him. He didn't care.",
      "We met at school. It was 2010.",
      "I'm at peace. Finally.",
      "She laughed at me. Everyone did.",
      "I work at night. Sleep is hard.",
      "I was at home.it was late.",
      "I'm @ home. Alone again.",
      "The cat sat. Then nothing.",
      "I was at home, dot dot dot, waiting.",
      "I sent an email to my mom and she never replied.",
    ])("allows %j", expectClean);
  });
});

describe("url", () => {
  describe("ES", () => {
    it.each([
      "mira https://example.org/mi-perfil",
      "entra a www.mipagina.es",
      "busca mipagina.com",
      "está en tienda.mx",
      "mi página: juan.dev",
      "t.me/juanito",
      "wa.me/5215512345678",
      "linktr.ee/juan",
    ])("detects %j", (text) => expectDetected(text, "url"));

    // Phone typing often drops the space after a period; TLDs that are also words
    // ("ni", "ve", "pa", "info", "es") must not turn that into a link.
    it.each([
      "Lloré.Ni siquiera supe por qué.",
      "No sé qué hacer.ve tú a saber.",
      "Estaba cansado.pa qué seguir.",
      "Me rendí.Info no tengo.",
      "Mi vida.es dura a veces",
      "Estaba bien.mal/peor, no sé.",
      "Me siento triste y/o enojado.",
      "Me dijo el Sr.García que todo iba a estar bien.",
      "Estoy cansado, triste, etc. y no sé por qué.",
    ])("allows %j", expectClean);
  });

  describe("EN", () => {
    it.each([
      "check out http://mysite.net",
      "go to www.example.org",
      "find me at lonelywolf.xyz",
      "bit.ly/abc123",
      "discord.gg/xyz789",
      "linktr.ee/sadgirl",
    ])("detects %j", (text) => expectDetected(text, "url"));

    it.each([
      "I tried so hard.Online friends don't get it.",
      "It's over.Live with it, they said.",
      "I gave up.App after app, nothing helped.",
      "Mr.Smith said it would be fine.",
      "It was 3.30 in the morning.",
    ])("allows %j", expectClean);
  });
});

describe("phone", () => {
  describe("ES", () => {
    it.each([
      "llámame al +52 55 1234 5678",
      "mi número es 55-1234-5678",
      "mi whats es 5512345678",
      "escríbeme al 612 345 678",
      "mi número: 612.345.678",
      "5 5 1 2 3 4 5 6 7 8",
    ])("detects %j", (text) => expectDetected(text, "phone"));

    it.each([
      "Tenía 12 años y mi mamá 45 cuando pasó.",
      "Fue el 12.05.2020, nunca lo olvido.",
      "Pasó en 2019 y otra vez en 2021.",
      "Viví ahí de 2019-2021.",
      "Debo 1.500.000 pesos y no duermo.",
      "Debo $1.250.350 y no sé qué hacer.",
      "Perdí 2.300.450 de pesos en un año.",
      "Llegué a las 3.30 de la mañana.",
    ])("allows %j", expectClean);
  });

  describe("EN", () => {
    it.each([
      "call me (555) 123-4567",
      "text me at 555 123 4567",
      "+1 555 123 4567",
      "my number is 555.123.4567",
    ])("detects %j", (text) => expectDetected(text, "phone"));

    it.each([
      "Lived there 1998 - 2003, worst years.",
      "I owe 1 000 000 and can't sleep.",
      "I owe $1,500,000.",
      "It's been 365 days.",
      "My daughter was born 3-4-2019.",
    ])("allows %j", expectClean);
  });
});

describe("handle", () => {
  describe("ES", () => {
    it.each([
      "sígueme @juan_perez",
      "búscame en ig @juanito.99",
      "IG: juanito_99",
      "mi insta es juan.perez",
      "agrégame en fb: juan.perez.77",
      "mi whats como juan_99",
      "agrégame: juan_perez99 en insta",
      "búscame como luna.triste22 en mi tiktok",
    ])("detects %j", (text) => expectDetected(text, "handle"));

    it.each([
      "Borré instagram porque me hacía sentir peor.",
      "Borré instagram porque me comparaba con todos.",
      "Mi insta era mi diario, ahora ya no.",
      "Dejé TikTok en 2023 y dormí mejor.",
      "Pasé la noche en whatsapp esperando que me escribiera.",
      "Dejé instagram ahora...",
      "Mi insta es raro...",
      "Dejé facebook por 2da vez.",
      "Me desperté @5am otra vez.",
      "Pasé 3 horas en instagram y me sentí vacía.",
      "Vi a mi ex en insta con alguien más.",
      "Me la paso en tiktok para no pensar.",
      "Pasé mis 20s en facebook y no me arrepiento.",
    ])("allows %j", expectClean);
  });

  describe("EN", () => {
    it.each([
      "dm me @sad_girl",
      "my snapchat is lonely_wolf22",
      "my ig is lonely_wolf22",
      "find me on insta as sad.girl.99",
      "add me on discord: wolfie_22",
      "telegram -> blue.moon7",
      "jane.doe88 on my ig",
    ])("detects %j", (text) => expectDetected(text, "handle"));

    it.each([
      "I quit WhatsApp for a month and felt lighter.",
      "Whats up... nothing really.",
      "I snap easily... it scares me.",
      "Threads of my life.. gone.",
      "I deleted facebook for the 2nd time.",
      "I deleted instagram 3 years ago.",
      "I wasted my 20s on instagram.",
      "I check instagram 100 times a day.",
    ])("allows %j", expectClean);
  });
});

describe("evasion through look-alike characters", () => {
  it.each([
    ["fullwidth email", "ｊｕａｎ＠ｇｍａｉｌ．ｃｏｍ", "email"],
    ["email split by zero-width chars", "juan​@gmail‌.com", "email"],
    ["phone split by zero-width chars", "55​1234⁠5678", "phone"],
    ["handle split by zero-width chars", "@juan‍_perez", "handle"],
  ] as const)("%s", (_label, text, kind) => expectDetected(text, kind));
});

describe("result shape", () => {
  it("reports every kind present, in a stable order", () => {
    expect(detectContactInfo("juan@gmail.com o +52 55 1234 5678 o @juan").kinds).toEqual(["email", "phone", "handle"]);
  });

  it("doesn't double-report an email's domain as a URL", () => {
    expect(detectContactInfo("juan@gmail.com").kinds).toEqual(["email"]);
  });

  it("reports both email and url for 'at' + domain, which could be either", () => {
    expect(detectContactInfo("john at gmail.com").kinds).toEqual(["email", "url"]);
  });
});

// Documented trade-offs, pinned so a future change to them is a conscious one.
describe("known limits", () => {
  it.each([
    "mi insta es juanito",
    "cinco cinco uno dos tres cuatro cinco seis siete ocho",
    "my number is five five five one two three four",
  ])("not detected (left to moderation and human review): %j", expectClean);

  it("over-detects '@' + word used as 'at' (\"nos vemos @casa\")", () => {
    expect(detectContactInfo("nos vemos @casa").kinds).toEqual(["handle"]);
  });
});

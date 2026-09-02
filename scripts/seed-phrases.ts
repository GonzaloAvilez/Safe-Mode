// One-off operational script: seeds the phrases table for D7.
// Run: npx tsx --env-file=.env.local scripts/seed-phrases.ts
//
// English set translated 2026-07-15 (workshop's shared language — see ROADMAP.md's
// language decision). Transcreated, not translated literally, same as the UI copy pass.
//
// Spanish set added for bilingual support (2026-09-01): these are the *original* 50
// phrases, recovered from git history (commit 21f0bcf, before the English translation)
// rather than translated back from the English set — the original phrasing predates any
// translation pass, so it's the more natural source. Same 9 categories/order as the
// English set (English category slugs reused here purely so the two arrays are easy to
// cross-reference — `category` isn't a DB column, just a console-log label).
import { supabaseAdmin } from "@/lib/supabase";
import { getEmbedding } from "@/lib/openai";
import { recordEmbeddingSpend } from "@/lib/spend";

type SeedPhrase = {
  text: string;
  category: string;
  language: "en" | "es";
};

const seedPhrases: SeedPhrase[] = [
  // Loneliness / feeling misunderstood
  { category: "loneliness", text: "Sometimes I'm surrounded by people and still feel completely alone.", language: "en" },
  { category: "loneliness", text: "No one seems to understand what I actually think, so I stopped trying to explain it.", language: "en" },
  { category: "loneliness", text: "I feel like I speak a different language than everyone around me.", language: "en" },
  { category: "loneliness", text: "It's hard to find someone I can just be myself with, without performing.", language: "en" },
  { category: "loneliness", text: "I've spent a long time looking for someone who understands my silence without needing it explained.", language: "en" },
  { category: "loneliness", text: "Sometimes I think I'm the only person who feels this.", language: "en" },

  // Uncertainty / fear of not being enough
  { category: "uncertainty", text: "I feel like technology is moving faster than I am, and it scares me that I'll get left behind.", language: "en" },
  { category: "uncertainty", text: "I've spent months doubting whether what I know how to do is still worth anything.", language: "en" },
  { category: "uncertainty", text: "I wonder what I'll become if what I used to do isn't enough anymore.", language: "en" },
  { category: "uncertainty", text: "Every time I apply for something, I feel like I'm not competitive anymore.", language: "en" },
  { category: "uncertainty", text: "I'm afraid my experience isn't worth what it used to be.", language: "en" },
  { category: "uncertainty", text: "I don't know if I'm underestimating myself, or if I really don't fit anywhere anymore.", language: "en" },

  // Grief / breakups / loss
  { category: "grief", text: "I lost something I thought would last forever, and I still don't know how to move on.", language: "en" },
  { category: "grief", text: "I miss someone who's gone, even if no one else notices.", language: "en" },
  { category: "grief", text: "Something important ended, and I feel like I lost a piece of myself along with it.", language: "en" },
  { category: "grief", text: "I'm still learning to live in a space that used to not be empty.", language: "en" },
  { category: "grief", text: "I don't know if I'm grieving the person, or who I used to be next to them.", language: "en" },

  // Authenticity / fear of being judged
  { category: "authenticity", text: "I hide parts of myself because I'm afraid I'll be rejected if people see them.", language: "en" },
  { category: "authenticity", text: "I got tired of weighing every word so I wouldn't make anyone uncomfortable.", language: "en" },
  { category: "authenticity", text: "I feel like if I show who I really am, I'll lose the people close to me.", language: "en" },
  { category: "authenticity", text: "I've never felt free to be exactly who I am, without editing myself.", language: "en" },
  { category: "authenticity", text: "I'm afraid my sensitivity is too much for the people around me.", language: "en" },
  { category: "authenticity", text: "I learned to smile even when I felt something completely different inside.", language: "en" },

  // Emptiness / disconnection from oneself
  { category: "emptiness", text: "I feel an emptiness I don't know how to fill, even though I have everything that's supposed to make me happy.", language: "en" },
  { category: "emptiness", text: "I don't know exactly what's wrong with me, I just know something isn't right.", language: "en" },
  { category: "emptiness", text: "I feel lost, like I've forgotten what I actually want.", language: "en" },
  { category: "emptiness", text: "Some days I go through everything on autopilot, feeling none of it.", language: "en" },
  { category: "emptiness", text: "I stopped recognizing myself somewhere along the way.", language: "en" },
  { category: "emptiness", text: "I feel like I need help, but I don't even know where to start asking for it.", language: "en" },

  // Needing to be heard / presence without judgment
  { category: "being-heard", text: "I'm not looking for advice, just someone who'll listen without trying to fix me.", language: "en" },
  { category: "being-heard", text: "Sometimes all I need is for someone to just be there, without asking for anything back.", language: "en" },
  { category: "being-heard", text: "I need a real conversation, not another one that gets forgotten right away.", language: "en" },
  { category: "being-heard", text: "I need to feel like someone cares how I'm doing, even if just for a moment.", language: "en" },
  { category: "being-heard", text: "I just want someone to listen without rushing to respond.", language: "en" },

  // Transition / rebuilding
  { category: "transition", text: "Everything I knew fell apart, and I'm still learning how to stand again.", language: "en" },
  { category: "transition", text: "I feel like I'm in the middle of a change I didn't choose but have to go through.", language: "en" },
  { category: "transition", text: "I don't know who I'll be when this is over, I just know I'm not who I used to be.", language: "en" },
  { category: "transition", text: "I'm rebuilding my life from scratch, and some days it weighs more than others.", language: "en" },
  { category: "transition", text: "Even though it hurts, I feel like this breaking point can also be a beginning.", language: "en" },
  { category: "transition", text: "I'm learning to walk again, even if no one sees the effort it takes.", language: "en" },

  // Protecting energy / needing space
  { category: "energy", text: "I need to get away from the noise so I can hear myself again.", language: "en" },
  { category: "energy", text: "Protecting my energy doesn't mean I don't care about people, just that I learned to protect myself.", language: "en" },
  { category: "energy", text: "I'd rather have silence than a conversation that doesn't feel genuine.", language: "en" },
  { category: "energy", text: "I'm not looking for crowds, I'm looking for a place where I can breathe easy.", language: "en" },
  { category: "energy", text: "I learned that stepping back in time is also a way of taking care of myself.", language: "en" },

  // Relief / experienced acceptance
  { category: "relief", text: "For the first time in a long time, I felt like I could be myself without anyone pulling away.", language: "en" },
  { category: "relief", text: "Someone listened to me without judgment, and something in me loosened.", language: "en" },
  { category: "relief", text: "I found out I wasn't as alone as I thought.", language: "en" },
  { category: "relief", text: "I found a little peace in a place I didn't expect to find it.", language: "en" },
  { category: "relief", text: "I felt, even if just for a moment, that it was okay to be exactly who I am.", language: "en" },

  // Soledad / sentirse incomprendido
  { category: "loneliness", text: "A veces estoy rodeado de gente y aun así me siento completamente solo.", language: "es" },
  { category: "loneliness", text: "Nadie parece entender lo que realmente pienso, así que dejé de intentar explicarlo.", language: "es" },
  { category: "loneliness", text: "Siento que hablo un idioma distinto al de todos los que me rodean.", language: "es" },
  { category: "loneliness", text: "Me cuesta encontrar a alguien con quien pueda simplemente ser yo, sin actuar.", language: "es" },
  { category: "loneliness", text: "Llevo tiempo buscando a alguien que entienda mi silencio sin que tenga que explicarlo.", language: "es" },
  { category: "loneliness", text: "A veces creo que soy la única persona que siente esto.", language: "es" },

  // Incertidumbre laboral / miedo a no ser suficiente
  { category: "uncertainty", text: "Siento que la tecnología está avanzando más rápido que yo y me da miedo quedarme atrás.", language: "es" },
  { category: "uncertainty", text: "Llevo meses dudando si lo que sé hacer todavía sirve para algo.", language: "es" },
  { category: "uncertainty", text: "Me pregunto qué voy a ser si lo que hacía ya no es suficiente.", language: "es" },
  { category: "uncertainty", text: "Cada vez que aplico a algo, siento que ya no soy competitivo.", language: "es" },
  { category: "uncertainty", text: "Tengo miedo de que mi experiencia ya no valga lo que valía antes.", language: "es" },
  { category: "uncertainty", text: "No sé si me subestimo o si de verdad ya no encajo en ningún lado.", language: "es" },

  // Duelo / rupturas / pérdidas
  { category: "grief", text: "Perdí algo que pensé que sería para siempre y todavía no sé cómo seguir.", language: "es" },
  { category: "grief", text: "Extraño a alguien que ya no está, aunque nadie más lo note.", language: "es" },
  { category: "grief", text: "Terminó algo importante y siento que perdí también un pedazo de mí.", language: "es" },
  { category: "grief", text: "Sigo aprendiendo a vivir en un espacio que antes no estaba vacío.", language: "es" },
  { category: "grief", text: "No sé si estoy de duelo por la persona o por quien era yo a su lado.", language: "es" },

  // Autenticidad / miedo a ser juzgado
  { category: "authenticity", text: "Escondo partes de mí porque tengo miedo de que me rechacen si las ven.", language: "es" },
  { category: "authenticity", text: "Me cansé de medir cada palabra para no incomodar a los demás.", language: "es" },
  { category: "authenticity", text: "Siento que si muestro cómo soy en realidad, voy a perder a la gente que tengo cerca.", language: "es" },
  { category: "authenticity", text: "Nunca me he sentido libre de ser exactamente quien soy, sin editarme.", language: "es" },
  { category: "authenticity", text: "Tengo miedo de que mi sensibilidad sea demasiado para las personas que me rodean.", language: "es" },
  { category: "authenticity", text: "Aprendí a sonreír aunque por dentro sintiera otra cosa completamente distinta.", language: "es" },

  // Vacío interno / desconexión de uno mismo
  { category: "emptiness", text: "Siento un vacío que no sé cómo llenar, aunque tenga todo lo que debería hacerme feliz.", language: "es" },
  { category: "emptiness", text: "No sé exactamente qué me pasa, solo sé que algo no está bien.", language: "es" },
  { category: "emptiness", text: "Me siento perdido, como si hubiera olvidado qué es lo que realmente quiero.", language: "es" },
  { category: "emptiness", text: "Hay días en que hago todo automático, sin sentir nada de lo que hago.", language: "es" },
  { category: "emptiness", text: "Dejé de reconocerme a mí mismo en algún punto del camino.", language: "es" },
  { category: "emptiness", text: "Siento que necesito ayuda, pero no sé ni por dónde empezar a pedirla.", language: "es" },

  // Necesidad de ser escuchado / presencia sin juicio
  { category: "being-heard", text: "No busco consejos, solo alguien que me escuche sin querer arreglarme.", language: "es" },
  { category: "being-heard", text: "A veces lo único que necesito es que alguien esté presente, sin pedir nada a cambio.", language: "es" },
  { category: "being-heard", text: "Me hace falta una conversación real, no otra más de las que se olvidan rápido.", language: "es" },
  { category: "being-heard", text: "Necesito sentir que a alguien le importa cómo estoy, aunque sea por un momento.", language: "es" },
  { category: "being-heard", text: "Solo quiero que alguien me escuche sin apurarse a responder.", language: "es" },

  // Transición / reconstrucción
  { category: "transition", text: "Todo lo que conocía se derrumbó y todavía estoy aprendiendo a pararme de nuevo.", language: "es" },
  { category: "transition", text: "Siento que estoy en medio de un cambio que no elegí pero que tengo que atravesar.", language: "es" },
  { category: "transition", text: "No sé quién voy a ser cuando esto termine, solo sé que ya no soy quien era.", language: "es" },
  { category: "transition", text: "Estoy reconstruyendo mi vida desde cero y algunos días pesa más que otros.", language: "es" },
  { category: "transition", text: "Aunque duela, siento que este quiebre también puede ser un inicio.", language: "es" },
  { category: "transition", text: "Estoy aprendiendo a caminar de nuevo, aunque nadie vea el esfuerzo que eso lleva.", language: "es" },

  // Protección de energía / necesidad de espacio propio
  { category: "energy", text: "Necesito alejarme del ruido para poder escucharme a mí mismo otra vez.", language: "es" },
  { category: "energy", text: "Cuidar mi energía no significa que no me importe la gente, solo que aprendí a protegerme.", language: "es" },
  { category: "energy", text: "Prefiero el silencio a una conversación que no se siente genuina.", language: "es" },
  { category: "energy", text: "No busco multitudes, busco un lugar donde pueda respirar tranquilo.", language: "es" },
  { category: "energy", text: "Aprendí que retirarme a tiempo también es una forma de cuidarme.", language: "es" },

  // Alivio / aceptación experimentada
  { category: "relief", text: "Por primera vez en mucho tiempo, sentí que podía ser yo sin que nadie se alejara.", language: "es" },
  { category: "relief", text: "Alguien me escuchó sin juzgarme y sentí que algo en mí se aflojó.", language: "es" },
  { category: "relief", text: "Descubrí que no estaba tan solo como pensaba.", language: "es" },
  { category: "relief", text: "Encontré un poco de paz en un lugar donde no esperaba encontrarla.", language: "es" },
  { category: "relief", text: "Sentí, aunque sea por un momento, que estaba bien ser exactamente quien soy.", language: "es" },
];

async function main() {
  console.log(`Seeding ${seedPhrases.length} phrases...\n`);

  let inserted = 0;
  let failed = 0;

  for (const [index, phrase] of seedPhrases.entries()) {
    const position = `[${index + 1}/${seedPhrases.length}]`;

    try {
      const { embedding, totalTokens } = await getEmbedding(phrase.text);

      const { error } = await supabaseAdmin.from("phrases").insert({
        text: phrase.text,
        language: phrase.language,
        embedding,
        source: "seed",
        active: true,
        moderation_status: "approved",
      });

      if (error) throw error;

      await recordEmbeddingSpend(totalTokens);

      console.log(`${position} OK (${phrase.category}): ${phrase.text}`);
      inserted++;
    } catch (error) {
      console.error(`${position} ERROR (${phrase.category}): ${phrase.text}`);
      console.error(`  → ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${failed} failed.`);
}

main();

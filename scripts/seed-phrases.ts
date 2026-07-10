// One-off operational script: seeds the phrases table for D7.
// Run: npx tsx --env-file=.env.local scripts/seed-phrases.ts
import { supabaseAdmin } from "@/lib/supabase";
import { getEmbedding } from "@/lib/openai";
import { recordEmbeddingSpend } from "@/lib/spend";

type SeedPhrase = {
  text: string;
  category: string;
};

const seedPhrases: SeedPhrase[] = [
  // Soledad / sentirse incomprendido
  { category: "soledad", text: "A veces estoy rodeado de gente y aun así me siento completamente solo." },
  { category: "soledad", text: "Nadie parece entender lo que realmente pienso, así que dejé de intentar explicarlo." },
  { category: "soledad", text: "Siento que hablo un idioma distinto al de todos los que me rodean." },
  { category: "soledad", text: "Me cuesta encontrar a alguien con quien pueda simplemente ser yo, sin actuar." },
  { category: "soledad", text: "Llevo tiempo buscando a alguien que entienda mi silencio sin que tenga que explicarlo." },
  { category: "soledad", text: "A veces creo que soy la única persona que siente esto." },

  // Incertidumbre laboral / miedo a no ser suficiente
  { category: "incertidumbre", text: "Siento que la tecnología está avanzando más rápido que yo y me da miedo quedarme atrás." },
  { category: "incertidumbre", text: "Llevo meses dudando si lo que sé hacer todavía sirve para algo." },
  { category: "incertidumbre", text: "Me pregunto qué voy a ser si lo que hacía ya no es suficiente." },
  { category: "incertidumbre", text: "Cada vez que aplico a algo, siento que ya no soy competitivo." },
  { category: "incertidumbre", text: "Tengo miedo de que mi experiencia ya no valga lo que valía antes." },
  { category: "incertidumbre", text: "No sé si me subestimo o si de verdad ya no encajo en ningún lado." },

  // Duelo / rupturas / pérdidas
  { category: "duelo", text: "Perdí algo que pensé que sería para siempre y todavía no sé cómo seguir." },
  { category: "duelo", text: "Extraño a alguien que ya no está, aunque nadie más lo note." },
  { category: "duelo", text: "Terminó algo importante y siento que perdí también un pedazo de mí." },
  { category: "duelo", text: "Sigo aprendiendo a vivir en un espacio que antes no estaba vacío." },
  { category: "duelo", text: "No sé si estoy de duelo por la persona o por quien era yo a su lado." },

  // Autenticidad / miedo a ser juzgado
  { category: "autenticidad", text: "Escondo partes de mí porque tengo miedo de que me rechacen si las ven." },
  { category: "autenticidad", text: "Me cansé de medir cada palabra para no incomodar a los demás." },
  { category: "autenticidad", text: "Siento que si muestro cómo soy en realidad, voy a perder a la gente que tengo cerca." },
  { category: "autenticidad", text: "Nunca me he sentido libre de ser exactamente quien soy, sin editarme." },
  { category: "autenticidad", text: "Tengo miedo de que mi sensibilidad sea demasiado para las personas que me rodean." },
  { category: "autenticidad", text: "Aprendí a sonreír aunque por dentro sintiera otra cosa completamente distinta." },

  // Vacío interno / desconexión de uno mismo
  { category: "vacio", text: "Siento un vacío que no sé cómo llenar, aunque tenga todo lo que debería hacerme feliz." },
  { category: "vacio", text: "No sé exactamente qué me pasa, solo sé que algo no está bien." },
  { category: "vacio", text: "Me siento perdido, como si hubiera olvidado qué es lo que realmente quiero." },
  { category: "vacio", text: "Hay días en que hago todo automático, sin sentir nada de lo que hago." },
  { category: "vacio", text: "Dejé de reconocerme a mí mismo en algún punto del camino." },
  { category: "vacio", text: "Siento que necesito ayuda, pero no sé ni por dónde empezar a pedirla." },

  // Necesidad de ser escuchado / presencia sin juicio
  { category: "escucha", text: "No busco consejos, solo alguien que me escuche sin querer arreglarme." },
  { category: "escucha", text: "A veces lo único que necesito es que alguien esté presente, sin pedir nada a cambio." },
  { category: "escucha", text: "Me hace falta una conversación real, no otra más de las que se olvidan rápido." },
  { category: "escucha", text: "Necesito sentir que a alguien le importa cómo estoy, aunque sea por un momento." },
  { category: "escucha", text: "Solo quiero que alguien me escuche sin apurarse a responder." },

  // Transición / reconstrucción
  { category: "transicion", text: "Todo lo que conocía se derrumbó y todavía estoy aprendiendo a pararme de nuevo." },
  { category: "transicion", text: "Siento que estoy en medio de un cambio que no elegí pero que tengo que atravesar." },
  { category: "transicion", text: "No sé quién voy a ser cuando esto termine, solo sé que ya no soy quien era." },
  { category: "transicion", text: "Estoy reconstruyendo mi vida desde cero y algunos días pesa más que otros." },
  { category: "transicion", text: "Aunque duela, siento que este quiebre también puede ser un inicio." },
  { category: "transicion", text: "Estoy aprendiendo a caminar de nuevo, aunque nadie vea el esfuerzo que eso lleva." },

  // Protección de energía / necesidad de espacio propio
  { category: "energia", text: "Necesito alejarme del ruido para poder escucharme a mí mismo otra vez." },
  { category: "energia", text: "Cuidar mi energía no significa que no me importe la gente, solo que aprendí a protegerme." },
  { category: "energia", text: "Prefiero el silencio a una conversación que no se siente genuina." },
  { category: "energia", text: "No busco multitudes, busco un lugar donde pueda respirar tranquilo." },
  { category: "energia", text: "Aprendí que retirarme a tiempo también es una forma de cuidarme." },

  // Alivio / aceptación experimentada
  { category: "alivio", text: "Por primera vez en mucho tiempo, sentí que podía ser yo sin que nadie se alejara." },
  { category: "alivio", text: "Alguien me escuchó sin juzgarme y sentí que algo en mí se aflojó." },
  { category: "alivio", text: "Descubrí que no estaba tan solo como pensaba." },
  { category: "alivio", text: "Encontré un poco de paz en un lugar donde no esperaba encontrarla." },
  { category: "alivio", text: "Sentí, aunque sea por un momento, que estaba bien ser exactamente quien soy." },
];

async function main() {
  console.log(`Sembrando ${seedPhrases.length} frases...\n`);

  let inserted = 0;
  let failed = 0;

  for (const [index, phrase] of seedPhrases.entries()) {
    const position = `[${index + 1}/${seedPhrases.length}]`;

    try {
      const { embedding, totalTokens } = await getEmbedding(phrase.text);

      const { error } = await supabaseAdmin.from("phrases").insert({
        text: phrase.text,
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

  console.log(`\nListo. ${inserted} insertadas, ${failed} fallidas.`);
}

main();

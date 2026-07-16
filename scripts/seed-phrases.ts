// One-off operational script: seeds the phrases table for D7.
// Run: npx tsx --env-file=.env.local scripts/seed-phrases.ts
//
// Translated to English 2026-07-15 (workshop's shared language — see ROADMAP.md's
// language decision). Transcreated, not translated literally, same as the UI copy pass:
// permission to deviate from the original Spanish structure for naturalness.
import { supabaseAdmin } from "@/lib/supabase";
import { getEmbedding } from "@/lib/openai";
import { recordEmbeddingSpend } from "@/lib/spend";

type SeedPhrase = {
  text: string;
  category: string;
};

const seedPhrases: SeedPhrase[] = [
  // Loneliness / feeling misunderstood
  { category: "loneliness", text: "Sometimes I'm surrounded by people and still feel completely alone." },
  { category: "loneliness", text: "No one seems to understand what I actually think, so I stopped trying to explain it." },
  { category: "loneliness", text: "I feel like I speak a different language than everyone around me." },
  { category: "loneliness", text: "It's hard to find someone I can just be myself with, without performing." },
  { category: "loneliness", text: "I've spent a long time looking for someone who understands my silence without needing it explained." },
  { category: "loneliness", text: "Sometimes I think I'm the only person who feels this." },

  // Uncertainty / fear of not being enough
  { category: "uncertainty", text: "I feel like technology is moving faster than I am, and it scares me that I'll get left behind." },
  { category: "uncertainty", text: "I've spent months doubting whether what I know how to do is still worth anything." },
  { category: "uncertainty", text: "I wonder what I'll become if what I used to do isn't enough anymore." },
  { category: "uncertainty", text: "Every time I apply for something, I feel like I'm not competitive anymore." },
  { category: "uncertainty", text: "I'm afraid my experience isn't worth what it used to be." },
  { category: "uncertainty", text: "I don't know if I'm underestimating myself, or if I really don't fit anywhere anymore." },

  // Grief / breakups / loss
  { category: "grief", text: "I lost something I thought would last forever, and I still don't know how to move on." },
  { category: "grief", text: "I miss someone who's gone, even if no one else notices." },
  { category: "grief", text: "Something important ended, and I feel like I lost a piece of myself along with it." },
  { category: "grief", text: "I'm still learning to live in a space that used to not be empty." },
  { category: "grief", text: "I don't know if I'm grieving the person, or who I used to be next to them." },

  // Authenticity / fear of being judged
  { category: "authenticity", text: "I hide parts of myself because I'm afraid I'll be rejected if people see them." },
  { category: "authenticity", text: "I got tired of weighing every word so I wouldn't make anyone uncomfortable." },
  { category: "authenticity", text: "I feel like if I show who I really am, I'll lose the people close to me." },
  { category: "authenticity", text: "I've never felt free to be exactly who I am, without editing myself." },
  { category: "authenticity", text: "I'm afraid my sensitivity is too much for the people around me." },
  { category: "authenticity", text: "I learned to smile even when I felt something completely different inside." },

  // Emptiness / disconnection from oneself
  { category: "emptiness", text: "I feel an emptiness I don't know how to fill, even though I have everything that's supposed to make me happy." },
  { category: "emptiness", text: "I don't know exactly what's wrong with me, I just know something isn't right." },
  { category: "emptiness", text: "I feel lost, like I've forgotten what I actually want." },
  { category: "emptiness", text: "Some days I go through everything on autopilot, feeling none of it." },
  { category: "emptiness", text: "I stopped recognizing myself somewhere along the way." },
  { category: "emptiness", text: "I feel like I need help, but I don't even know where to start asking for it." },

  // Needing to be heard / presence without judgment
  { category: "being-heard", text: "I'm not looking for advice, just someone who'll listen without trying to fix me." },
  { category: "being-heard", text: "Sometimes all I need is for someone to just be there, without asking for anything back." },
  { category: "being-heard", text: "I need a real conversation, not another one that gets forgotten right away." },
  { category: "being-heard", text: "I need to feel like someone cares how I'm doing, even if just for a moment." },
  { category: "being-heard", text: "I just want someone to listen without rushing to respond." },

  // Transition / rebuilding
  { category: "transition", text: "Everything I knew fell apart, and I'm still learning how to stand again." },
  { category: "transition", text: "I feel like I'm in the middle of a change I didn't choose but have to go through." },
  { category: "transition", text: "I don't know who I'll be when this is over, I just know I'm not who I used to be." },
  { category: "transition", text: "I'm rebuilding my life from scratch, and some days it weighs more than others." },
  { category: "transition", text: "Even though it hurts, I feel like this breaking point can also be a beginning." },
  { category: "transition", text: "I'm learning to walk again, even if no one sees the effort it takes." },

  // Protecting energy / needing space
  { category: "energy", text: "I need to get away from the noise so I can hear myself again." },
  { category: "energy", text: "Protecting my energy doesn't mean I don't care about people, just that I learned to protect myself." },
  { category: "energy", text: "I'd rather have silence than a conversation that doesn't feel genuine." },
  { category: "energy", text: "I'm not looking for crowds, I'm looking for a place where I can breathe easy." },
  { category: "energy", text: "I learned that stepping back in time is also a way of taking care of myself." },

  // Relief / experienced acceptance
  { category: "relief", text: "For the first time in a long time, I felt like I could be myself without anyone pulling away." },
  { category: "relief", text: "Someone listened to me without judgment, and something in me loosened." },
  { category: "relief", text: "I found out I wasn't as alone as I thought." },
  { category: "relief", text: "I found a little peace in a place I didn't expect to find it." },
  { category: "relief", text: "I felt, even if just for a moment, that it was okay to be exactly who I am." },
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

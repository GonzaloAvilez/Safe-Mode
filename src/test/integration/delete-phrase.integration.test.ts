import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { deletePhrase } from "@/lib/phrases";

const ids: string[] = [];
afterEach(async () => {
  if (ids.length) {
    const { error } = await supabaseAdmin.from("phrases").delete().in("id", ids);
    if (error) throw error;
    ids.length = 0;
  }
});

describe("deletePhrase (integration)", () => {
  it.each(["seed", "user"])("deletes a %s phrase and its dependents, preserving another phrase", async (source) => {
    const target = randomUUID();
    const survivor = randomUUID();
    ids.push(target, survivor);
    const { error: insertError } = await supabaseAdmin.from("phrases").insert([
      { id: target, text: "Deletion test target", source },
      { id: survivor, text: "Deletion test survivor", source },
    ]);
    if (insertError) throw insertError;
    for (const phrase_id of [target, survivor]) {
      const { error: narrativeError } = await supabaseAdmin.from("phrase_narratives").insert({
        phrase_id, primary_theme: "test", primary_need: "test", transition_from: "test",
        transition_to: "test", public_narrative: "Test narrative", confidence: 1, model: "test",
      });
      if (narrativeError) throw narrativeError;
      const { error: resonanceError } = await supabaseAdmin.from("phrase_resonances").insert({
        phrase_id, session_id: randomUUID(),
      });
      if (resonanceError) throw resonanceError;
    }
    await deletePhrase(target);
    await deletePhrase(target); // Safe retry if a response was lost.
    for (const [table, column] of [["phrases", "id"], ["phrase_narratives", "phrase_id"], ["phrase_resonances", "phrase_id"]]) {
      const { data, error } = await supabaseAdmin.from(table).select(column).in(column, [target, survivor]);
      if (error) throw error;
      expect(data).toEqual([{ [column]: survivor }]);
    }
  });
});

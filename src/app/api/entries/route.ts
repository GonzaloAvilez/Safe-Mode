import { submitEntry } from "@/lib/entries";

const MAX_TEXT_LENGTH = 800;

export async function POST(request: Request) {
  const body = await request.json();
  const text = body.text;
  const scaleBefore = body.scaleBefore;

  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `text is required and must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const result = await submitEntry(text, scaleBefore);

  return Response.json(result);
}

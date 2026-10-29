import { readFileSync } from "node:fs";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});
const SECRET_ID = process.env.OPENAI_SECRET_ID || "";
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "*").replace(/\/$/, "");
const REFERENCE = readFileSync(new URL("./cpd_reference.txt", import.meta.url), "utf8").slice(0, 10000);
let cachedKey;

const schema = {
  type: "object", additionalProperties: false,
  required: ["environment_summary", "visual_lenses", "ranked_activities", "cross_curricular_links", "limitations"],
  properties: {
    environment_summary: { type: "string" },
    visual_lenses: { type: "array", minItems: 4, maxItems: 4, items: {
      type: "object", additionalProperties: false,
      required: ["name", "observed_features", "possible_learning_links", "confidence"],
      properties: { name: { type: "string" }, observed_features: { type: "string" }, possible_learning_links: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } }, confidence: { type: "integer", minimum: 0, maximum: 100 } }
    }},
    ranked_activities: { type: "array", minItems: 3, maxItems: 3, items: {
      type: "object", additionalProperties: false,
      required: ["rank", "title", "activity_type", "phase", "duration", "risk_level", "primary_virtue", "secondary_virtues", "heritage_anchor", "purpose_and_beneficiary", "why_this_fits", "student_actions", "adult_role_and_boundary", "before_preparation", "during_sequence", "after_reflection", "evidence_of_character", "inclusion_and_adaptations", "curriculum_links"],
      properties: {
        rank: { type: "integer", minimum: 1, maximum: 3 }, title: { type: "string" }, activity_type: { type: "string" }, phase: { type: "string" }, duration: { type: "string" }, risk_level: { type: "string" }, primary_virtue: { type: "string" }, secondary_virtues: { type: "array", minItems: 0, maxItems: 3, items: { type: "string" } }, heritage_anchor: { type: "string" }, purpose_and_beneficiary: { type: "string" }, why_this_fits: { type: "string" }, student_actions: { type: "array", minItems: 2, maxItems: 7, items: { type: "string" } }, adult_role_and_boundary: { type: "string" }, before_preparation: { type: "string" }, during_sequence: { type: "string" }, after_reflection: { type: "string" }, evidence_of_character: { type: "string" }, inclusion_and_adaptations: { type: "string" }, curriculum_links: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["subject", "objective"], properties: { subject: { type: "string" }, objective: { type: "string" } } } }
      }
    }},
    cross_curricular_links: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["subject", "application"], properties: { subject: { type: "string" }, application: { type: "string" } } } },
    limitations: { type: "array", items: { type: "string" } }
  }
};

function response(statusCode, body){ return { statusCode, headers: { "content-type":"application/json", "access-control-allow-origin":ALLOWED_ORIGIN, "access-control-allow-headers":"authorization,content-type", "access-control-allow-methods":"POST,OPTIONS" }, body: JSON.stringify(body) }; }
async function getOpenAIKey(){
  if(cachedKey) return cachedKey;
  const value = await secrets.send(new GetSecretValueCommand({SecretId: SECRET_ID}));
  const raw = value.SecretString || "";
  try { const parsed = JSON.parse(raw); cachedKey = parsed.OPENAI_API_KEY || parsed.openai_api_key; } catch { cachedKey = raw; }
  if(!cachedKey) throw new Error("OPENAI_API_KEY is missing from the configured secret.");
  return cachedKey;
}
function decodeBody(event){ if(!event.body) return {}; const text=event.isBase64Encoded ? Buffer.from(event.body,"base64").toString("utf8") : event.body; return JSON.parse(text); }
function validate(body){
  const images = Array.isArray(body.images) ? body.images : [];
  const hasDescription = [body.environment_description, body.setting, body.notes].some(value=>typeof value === "string" && value.trim());
  if(images.length > 6) return "Upload no more than six photographs.";
  if(!images.length && !hasDescription) return "Add at least one photograph or describe the environment.";
  if(images.some(image=>typeof image!=="string" || !image.startsWith("data:image/") || image.length>2_000_000)) return "Each photograph must be a compressed JPG, PNG or WEBP image.";
  if(typeof body.year_group !== "string" || !body.year_group) return "Choose a year group.";
  if(typeof body.phase !== "string" || !body.phase) return "Choose a programme phase.";
  if(!Number.isInteger(body.group_size) || body.group_size < 1 || body.group_size > 500) return "Enter a valid group size.";
  return null;
}
function promptFor(body){
  const consent = body.faces_consent ? "The user confirms recorded consent exists for identifiable student faces. Do not identify people or infer sensitive traits regardless." : "No face consent is confirmed. Do not analyse identities, faces or personal traits; focus on the environment and non-identifying features only.";
  const regeneration = body.regenerate ? `This is a second pass. Avoid repeating these previous titles: ${(body.previous_titles||[]).join("; ")}.` : "";
  return `You are a Character Development Lab. Design practical character-development experiences from photographs and/or a written description of a real environment.

PROGRAMME REFERENCE (working source of truth; do not call draft material officially approved):
${REFERENCE}

USER BRIEF:
- Curriculum framework: ${body.curriculum_framework || "Character Development Framework"}
- Phase: ${body.phase}
- Year group: ${body.year_group}
- Group size: ${body.group_size}
- Session type preference: ${body.session_type || "recommend"}
- Time available: ${body.duration || "not specified"}
- Setting: ${body.setting || "not specified"}
- Written environment description: ${body.environment_description || "none"}
- Additional context: ${body.notes || "none"}
- ${consent}
- ${regeneration}

TASK:
1. Analyse all photographs as one environment. Do not invent objects or conditions that are not visible. If images show different spaces, say so. If there are no photographs, use the written environment description as the primary evidence and make clear that the evidence is described rather than visually verified. If both are supplied, combine them but distinguish visible evidence from user-provided context.
2. Always return exactly four visual lenses, using these names: Objects, materials and tools; Colours, shapes, patterns and measurements; Nature, living systems and physical forces; Culture, language, art and sustainability.
3. Use the lenses to propose genuine learning possibilities, but do not force a curriculum or virtue that the photographs cannot support.
4. Return exactly three ranked activities. Make them meaningfully different and rank them by fit, authenticity, developmental value and feasibility—not by spectacle.
5. Use the selected phase and year group. Foundation means wonder and habit; Development means contribution and stretch; Mastery means duty and adversity.
6. Every activity must have one primary virtue, no more than three secondary virtues, a real purpose or beneficiary, student-owned actions, an adult safety boundary, before/during/after experience arc, reflection, evidence of character and inclusion adaptations.
7. Treat Al Sanaa' as lived respect, hospitality, kinship, reciprocity, dignity, patience, listening and stewardship. Use a heritage anchor only where it is genuine. Do not use elders as charity subjects; frame Majlis or elder work as reciprocal hospitality and knowledge exchange.
8. Apply “raise the stakes, not the novelty,” “service intensity trails challenge intensity by a band,” and “every heritage experience has a character outcome as well as a craft/cultural/technical outcome.”
9. Curriculum links may include the selected framework and credible cross-curricular applications. Phrase them as proposed links unless the exact official curriculum source is supplied. Do not invent approval, partners, qualifications or legal requirements.
10. Include a realistic risk level. If specialist approval, licensed practitioners, water, animals, heat, fire, height, night travel or transport are involved, state that human review is mandatory.
11. Be specific about visible evidence. Never identify children, infer protected characteristics or make psychological diagnoses.
12. Mark all three activities as AI-DRAFT in meaning even though the schema does not contain an approval field. Do not mention the name of the school, organisation, brand or source file in the user-facing result.

Keep every text field concise (one or two sentences), use no more than three student actions per activity and no more than two curriculum links per activity. Return only JSON matching the supplied schema.`;
}

export const handler = async event => {
  if(event.requestContext?.http?.method === "OPTIONS") return response(204, {});
  try{
    const body = decodeBody(event); const invalid = validate(body); if(invalid) return response(400,{error:invalid});
    const key = await getOpenAIKey();
    const images = Array.isArray(body.images) ? body.images : [];
    const input = [{role:"user",content:[{type:"input_text",text:promptFor(body)}, ...images.map(image=>({type:"input_image",image_url:image,detail:"low"}))]}];
    const api = await fetch("https://api.openai.com/v1/responses", {method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-6-luna",input,text:{format:{type:"json_schema",name:"character_environment_plan",strict:true,schema}},max_output_tokens:3600,store:false})});
    const data = await api.json(); if(!api.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
    const outputText = data.output_text || data.output?.flatMap(item=>item.content || []).find(item=>item.type === "output_text")?.text; if(!outputText) throw new Error("OpenAI returned no structured plan.");
    return response(200,{plan:JSON.parse(outputText)});
  } catch(error){ console.error("Character development analysis failed",error?.message); return response(500,{error:"The environment could not be analysed. Please try again."}); }
};

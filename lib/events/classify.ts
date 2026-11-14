import type { Category, Topic } from "@/lib/types";

/**
 * Keyword rules for sources that already give structured data (JSON-LD,
 * calendars) and therefore do not need a model call. The model does this job for
 * free-text sources.
 */
const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ["hackathon", /\b(hackathon|hack ?day|datathon|ideathon|case competition|coding competition|capture the flag|ctf|pitch competition|challenge)\b/i],
  ["internship", /\b(intern(ship)?s?|graduate (programme|program|trainee)|management trainee|summer analyst|placement)\b/i],
  ["helper", /\b(student helper|student assistant|part[- ]time|research assistant|teaching assistant|campus ambassador|student ambassador)\b/i],
  ["volunteering", /\b(volunteer(s|ing)?|community service|charity|fundrais(er|ing)|beach clean[- ]?up|service learning)\b/i],
  ["training", /\b(workshop|training|bootcamp|boot camp|masterclass|short course|certificate|hands[- ]on|tutorial)\b/i],
  ["meetup", /\b(meet ?up|networking|mixer|social|gathering|career fair|info(rmation)? session|open day|fair)\b/i],
  ["seminar", /\b(seminar|talk|lecture|webinar|panel|forum|conference|symposium|colloquium|summit)\b/i],
];

/**
 * The title decides when it names a kind of activity; the longer text is only
 * consulted when the title says nothing, because a description mentions many
 * things ("bring a laptop for the hands-on part") that are not what the event is.
 */
export function guessCategory(title: string, details = ""): Category {
  for (const text of [title, details]) {
    if (!text) continue;
    for (const [category, pattern] of CATEGORY_RULES) {
      if (pattern.test(text)) return category;
    }
  }
  return "seminar";
}

const TOPIC_RULES: Array<[Topic, RegExp]> = [
  ["ai", /\b(ai|a\.i\.|artificial intelligence|machine learning|deep learning|llm|generative|genai|nlp|computer vision)\b/i],
  ["data", /\b(data science|data analytics|big data|datathon|statistics|analytics|visuali[sz]ation)\b/i],
  ["software", /\b(software|coding|programming|developer|web3|app development|open source|cloud|devops|full[- ]stack)\b/i],
  ["cybersecurity", /\b(cyber ?security|infosec|ctf|capture the flag|penetration|privacy)\b/i],
  ["fintech", /\b(fintech|blockchain|crypto|digital asset|payments|insurtech|regtech|virtual bank)\b/i],
  ["finance", /\b(finance|banking|investment|trading|accounting|asset management|wealth)\b/i],
  ["business", /\b(business|consulting|management|strategy|case competition|operations)\b/i],
  ["entrepreneurship", /\b(start[- ]?up|entrepreneur(ship)?|founder|venture|incubat|accelerator|pitch)\b/i],
  ["marketing", /\b(marketing|branding|social media|advertising|public relations|content creation)\b/i],
  ["design", /\b(design|ux|ui|product design|architecture|creative)\b/i],
  ["engineering", /\b(engineering|mechanical|electrical|civil|hardware|semiconductor|iot)\b/i],
  ["robotics", /\b(robot(ics)?|drone|autonomous|mechatronics)\b/i],
  ["sustainability", /\b(sustainab|climate|esg|green|environment|carbon|recycl|net[- ]zero)\b/i],
  ["social-impact", /\b(social impact|ngo|non[- ]profit|community|charity|elderly|underprivileged|inclusion)\b/i],
  ["healthcare", /\b(health|medical|biotech|pharma|nursing|mental health|wellbeing|well-being)\b/i],
  ["education", /\b(education|teaching|tutor|edtech|mentor(ing|ship)?|learning)\b/i],
  ["research", /\b(research|phd|postgraduate|academic|symposium|colloquium|thesis)\b/i],
  ["media", /\b(media|journalism|film|video|podcast|broadcast)\b/i],
  ["arts", /\b(art|music|theatre|theater|performance|exhibition|culture|heritage)\b/i],
  ["law", /\b(law|legal|moot|arbitration|compliance)\b/i],
  ["languages", /\b(language|english|mandarin|putonghua|cantonese|translation)\b/i],
  ["sports", /\b(sport|football|basketball|running|marathon|fitness|hiking)\b/i],
  ["gaming", /\b(gaming|esports|e-sports|game (dev|development|jam))\b/i],
  ["career", /\b(career|recruit(ment|ing)?|job|cv|resume|interview|employer|graduate programme)\b/i],
];

export function guessTags(text: string, limit = 5): Topic[] {
  const tags: Topic[] = [];
  for (const [topic, pattern] of TOPIC_RULES) {
    if (pattern.test(text)) tags.push(topic);
    if (tags.length >= limit) break;
  }
  return tags;
}

/**
 * Hong Kong universities and the e-mail domains that prove a student belongs
 * to one. Keep the domains in sync with is_hk_uni_email() in supabase/schema.sql.
 */
export interface University {
  name: string;
  short: string;
  domains: string[];
}

export const HK_UNIVERSITIES: University[] = [
  { name: "City University of Hong Kong", short: "CityU", domains: ["cityu.edu.hk"] },
  { name: "The University of Hong Kong", short: "HKU", domains: ["hku.hk"] },
  { name: "The Chinese University of Hong Kong", short: "CUHK", domains: ["cuhk.edu.hk"] },
  { name: "The Hong Kong University of Science and Technology", short: "HKUST", domains: ["ust.hk"] },
  { name: "The Hong Kong Polytechnic University", short: "PolyU", domains: ["polyu.edu.hk", "polyu.hk"] },
  { name: "Hong Kong Baptist University", short: "HKBU", domains: ["hkbu.edu.hk"] },
  { name: "Lingnan University", short: "LingU", domains: ["ln.edu.hk", "ln.hk"] },
  { name: "The Education University of Hong Kong", short: "EdUHK", domains: ["eduhk.hk"] },
  { name: "Hong Kong Metropolitan University", short: "HKMU", domains: ["hkmu.edu.hk"] },
  { name: "Hong Kong Shue Yan University", short: "HKSYU", domains: ["hksyu.edu"] },
  { name: "The Hang Seng University of Hong Kong", short: "HSUHK", domains: ["hsu.edu.hk"] },
  { name: "Vocational Training Council", short: "VTC", domains: ["vtc.edu.hk"] },
  { name: "The Hong Kong Academy for Performing Arts", short: "HKAPA", domains: ["hkapa.edu"] },
  { name: "Saint Francis University", short: "SFU", domains: ["sfu.edu.hk"] },
  { name: "Tung Wah College", short: "TWC", domains: ["twc.edu.hk"] },
  { name: "Hong Kong Chu Hai College", short: "Chu Hai", domains: ["chuhai.edu.hk"] },
];

/** Returns the university an e-mail address belongs to, or null. */
export function universityForEmail(email: string): University | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  return (
    HK_UNIVERSITIES.find((u) =>
      u.domains.some((d) => domain === d || domain.endsWith(`.${d}`)),
    ) ?? null
  );
}

export function isHkUniEmail(email: string): boolean {
  return universityForEmail(email) !== null;
}

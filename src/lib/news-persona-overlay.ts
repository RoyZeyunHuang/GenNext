import overlayData from "@/data/news-persona-overlays.json";

export type PersonaOverlay = {
  persona_name: string;
  persona_id: string;
  angle: string;
  title: string;
  body: string;
};

const overlayMap = overlayData as Record<string, PersonaOverlay>;

export function getPersonaOverlay(articleId: string): PersonaOverlay | null {
  return overlayMap[articleId] ?? null;
}

export function hasPersonaOverlay(articleId: string): boolean {
  return articleId in overlayMap;
}

export function getAllOverlayArticleIds(): string[] {
  return Object.keys(overlayMap);
}

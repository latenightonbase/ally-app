export interface FamilyArtwork {
  id: string;
  label: string;
  emoji: string;
  background: string;
}

export const FAMILY_ARTWORKS: FamilyArtwork[] = [
  { id: "forest", label: "Forest", emoji: "🌲", background: "#14532d" },
  { id: "sunset", label: "Sunset", emoji: "🌅", background: "#c2410c" },
  { id: "ocean", label: "Ocean", emoji: "🌊", background: "#0369a1" },
  { id: "mountain", label: "Mountain", emoji: "🏔️", background: "#475569" },
  { id: "campfire", label: "Campfire", emoji: "🔥", background: "#9a3412" },
  { id: "rainbow", label: "Rainbow", emoji: "🌈", background: "#7c3aed" },
  { id: "hearth", label: "Hearth", emoji: "🏡", background: "#a16207" },
  { id: "garden", label: "Garden", emoji: "🌻", background: "#65a30d" },
  { id: "meadow", label: "Meadow", emoji: "🦋", background: "#0e7490" },
];

export const DEFAULT_FAMILY_ARTWORK_ID = FAMILY_ARTWORKS[0].id;

export function getFamilyArtwork(id: string | null | undefined): FamilyArtwork {
  if (!id) return FAMILY_ARTWORKS[0];
  return FAMILY_ARTWORKS.find((a) => a.id === id) ?? FAMILY_ARTWORKS[0];
}

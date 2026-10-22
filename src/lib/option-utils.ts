/**
 * Parses raw option value name with parentheses into clean label and subtitle.
 * Example:
 * "Level 0 (Tidak Pedas)" -> label: "Level 0", desc: "Tidak pedas"
 * "Level 1 (Sedang)" -> label: "Level 1", desc: "Sedang"
 * "Level 2 (Pedas Mantap)" -> label: "Level 2", desc: "Pedas"
 */
export function parseOptionLabel(rawName: string): { label: string; desc: string } {
  const match = rawName.match(/^([^(]+)(?:\(([^)]+)\))?$/);
  if (!match) return { label: rawName, desc: "" };

  const rawLabel = match[1].trim();
  const rawDesc = match[2] ? match[2].trim() : "";

  // Explicit spicy level normalization
  if (rawLabel.toLowerCase().startsWith("level 0")) {
    return { label: "Level 0", desc: "Tidak pedas" };
  }
  if (rawLabel.toLowerCase().startsWith("level 1")) {
    return { label: "Level 1", desc: "Sedang" };
  }
  if (rawLabel.toLowerCase().startsWith("level 2")) {
    return { label: "Level 2", desc: "Pedas" };
  }

  // Other option groups (e.g., Porsi Nasi, Telur)
  let desc = rawDesc;
  if (desc) {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1).toLowerCase();
  }

  return { label: rawLabel, desc };
}

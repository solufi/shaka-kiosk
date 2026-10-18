/** Presentation only: never changes stock, price or physical vending addresses. */
export type DisplayLayout = { schemaVersion: 1; columns: number; orderedIds: string[] };
export const DEFAULT_DISPLAY: DisplayLayout = { schemaVersion: 1, columns: 0, orderedIds: [] };
export function validateDisplay(value: unknown): DisplayLayout {
  const v = value as DisplayLayout;
  if (!v || v.schemaVersion !== 1 || !Number.isInteger(v.columns) || v.columns < 0 || v.columns > 8 ||
      !Array.isArray(v.orderedIds) || v.orderedIds.length > 500 ||
      v.orderedIds.some(id => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) ||
      new Set(v.orderedIds).size !== v.orderedIds.length) throw new Error('Disposition invalide');
  return { schemaVersion: 1, columns: v.columns, orderedIds: [...v.orderedIds] };
}
export function arrangeProducts<T extends { id: string; order?: number; visible?: boolean }>(products: T[], layout: DisplayLayout): T[] {
  const positions = new Map(layout.orderedIds.map((id, index) => [id, index]));
  return products.filter(p => p.visible !== false).slice().sort((a, b) =>
    (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) || (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
}
export function displayColumns(columns: number): string {
  return columns === 0 ? 'repeat(auto-fit, minmax(12rem, 1fr))' : `repeat(${columns}, minmax(0, 1fr))`;
}

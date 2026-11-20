/** Presentation only: never changes stock, price or physical vending addresses. */
export type DisplayCategory = { id: string; label: string; productIds: string[] };
export type DisplayLayout = {
  schemaVersion: 1; columns: number; orderedIds: string[];
  mode?: 'scroll' | 'pages'; rows?: number;
  categoriesEnabled?: boolean; categories?: DisplayCategory[];
};
export const DEFAULT_DISPLAY: DisplayLayout = { schemaVersion: 1, columns: 0, orderedIds: [] };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,100}$/.test(id);
export function validateDisplay(value: unknown): DisplayLayout {
  const v = value as DisplayLayout;
  if (!v || v.schemaVersion !== 1 || !Number.isInteger(v.columns) || v.columns < 0 || v.columns > 8 ||
      !Array.isArray(v.orderedIds) || v.orderedIds.length > 500 || v.orderedIds.some(id => !validId(id)) ||
      new Set(v.orderedIds).size !== v.orderedIds.length) throw new Error('Disposition invalide');
  if (v.mode !== undefined && !['scroll','pages'].includes(v.mode)) throw new Error('Mode d’affichage invalide');
  if (v.rows !== undefined && (!Number.isInteger(v.rows) || v.rows < 0 || v.rows > 4)) throw new Error('Nombre de rangées invalide');
  if (v.categoriesEnabled !== undefined && typeof v.categoriesEnabled !== 'boolean') throw new Error('Option de catégories invalide');
  const result: DisplayLayout = { schemaVersion:1, columns:v.columns, orderedIds:[...v.orderedIds] };
  if (v.mode !== undefined) result.mode=v.mode;
  if (v.rows !== undefined) result.rows=v.rows;
  if (v.categoriesEnabled !== undefined) result.categoriesEnabled=v.categoriesEnabled;
  if (v.categories !== undefined) {
    if (!Array.isArray(v.categories) || v.categories.length>20) throw new Error('Maximum de 20 catégories');
    const ids=new Set<string>(),labels=new Set<string>(),assigned=new Set<string>();
    result.categories=v.categories.map(group=>{
      if (!group || !validId(group.id) || ['all','other'].includes(group.id) || ids.has(group.id) || typeof group.label!=='string' ||
          !group.label.trim() || group.label.trim().length>36 || /[\u0000-\u001f\u007f]/.test(group.label) || !Array.isArray(group.productIds) || group.productIds.length>500) throw new Error('Catégorie invalide');
      const label=group.label.trim(),key=label.toLocaleLowerCase('fr-CA');
      if (['tous','autres'].includes(key) || labels.has(key)) throw new Error('Les noms de catégories doivent être distincts de Tous et Autres');
      ids.add(group.id);labels.add(key);
      const productIds=group.productIds.map(id=>{if(!validId(id)||assigned.has(id))throw new Error('Un produit ne peut être classé que dans une catégorie');assigned.add(id);return id;});
      return {id:group.id,label,productIds};
    });
  }
  return result;
}
export function needsNavigation(layout:DisplayLayout) { return layout.mode==='pages' || layout.categoriesEnabled===true; }
export function arrangeProducts<T extends { id: string; order?: number; visible?: boolean }>(products: T[], layout: DisplayLayout): T[] {
  const positions = new Map(layout.orderedIds.map((id, index) => [id, index]));
  return products.filter(p => p.visible !== false).slice().sort((a, b) =>
    (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) || (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
}
export function displayColumns(columns: number): string {
  return columns === 0 ? 'repeat(auto-fit, minmax(12rem, 1fr))' : `repeat(${columns}, minmax(0, 1fr))`;
}
export function categoryOptions(products:{id:string;visible?:boolean}[],layout:DisplayLayout) {
  const visible=products.filter(p=>p.visible!==false),available=new Set(visible.map(p=>p.id));
  const options=[{id:'all',label:'Tous',count:visible.length}];
  if (!layout.categoriesEnabled) return options;
  const assigned=new Set<string>();
  for(const group of layout.categories || []) {
    group.productIds.forEach(id=>assigned.add(id));
    const count=group.productIds.filter(id=>available.has(id)).length;
    if(count)options.push({id:group.id,label:group.label,count});
  }
  const others=visible.filter(p=>!assigned.has(p.id)).length;
  if(others)options.push({id:'other',label:'Autres',count:others});
  return options;
}
export function filterCategory<T extends {id:string}>(products:T[],layout:DisplayLayout,category:string):T[] {
  if (!layout.categoriesEnabled || category==='all') return products;
  const assigned=new Set((layout.categories || []).flatMap(c=>c.productIds));
  if(category==='other')return products.filter(p=>!assigned.has(p.id));
  const group=layout.categories?.find(c=>c.id===category);
  return group?products.filter(p=>group.productIds.includes(p.id)):products;
}
/** Bound the density to the physical space, including when the cart narrows it. */
export function catalogGeometry(width:number,height:number,columns=0,rows=0) {
  const maxColumns=Math.max(1,Math.min(8,Math.floor((width+12)/168)));
  const maxRows=Math.max(1,Math.min(4,Math.floor((height+12)/202)));
  const fittedColumns=Math.min(maxColumns,columns || Math.max(1,Math.min(6,Math.floor((width+12)/220))));
  const fittedRows=Math.min(maxRows,rows || Math.max(1,Math.min(3,Math.floor((height+12)/272))));
  return {columns:fittedColumns,rows:fittedRows,capacity:fittedColumns*fittedRows};
}
export function catalogPage<T>(products:T[],page:number,capacity:number) {
  const count=Math.max(1,Math.ceil(products.length/Math.max(1,capacity)));
  const current=Math.max(0,Math.min(count-1,Math.floor(page)||0));
  return {items:products.slice(current*capacity,(current+1)*capacity),page:current,count};
}

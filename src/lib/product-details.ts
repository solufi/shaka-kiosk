export function productDetails(description: string) {
  const details:string[]=[],contains:string[]=[],mayContain:string[]=[];
  for (const segment of (description || '').split(/\s*\|\s*/)) {
    const text=segment.trim();
    const value=text.match(/^Allergènes\s*[—–-]\s*(Contient|Peut contenir)\s*:\s*(.*)$/i);
    if (value) (value[1].toLowerCase()==='contient'?contains:mayContain).push(value[2]);
    else if (text && !/^Source\s+(des\s+)?allergènes\s*:/i.test(text)) details.push(text);
  }
  const words=details.join(' ').split(/\s+/).filter(Boolean),pages:string[]=[];
  let page='';
  for (const word of words) {
    if (page.length+word.length+(page?1:0)>420 && page) {pages.push(page);page='';}
    page+=(page?' ':'')+word;
  }
  if (page) pages.push(page);
  return {contains:contains.join(' '),mayContain:mayContain.join(' '),pages:pages.length?pages:['']};
}

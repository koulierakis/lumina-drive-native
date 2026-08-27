(() => {
  const aliases = [
    ['pizza', /πιτσαρ|pizza|fast\s*food/], ['coffee', /καφ[εέ]|cafe|coffee/],
    ['restaurant', /εστιατ|φαγητ|restaurant/], ['gas_station', /βενζιν|καυσ|fuel|gas/],
    ['pharmacy', /φαρμακ/], ['hotel', /ξενοδοχ|hotel/],
    ['supermarket', /supermarket|σουπερ\s*μαρκετ|μάρκετ/], ['gym', /γυμναστ|fitness/],
  ];
  window.luminaParseIntent = (input) => {
    const text = input.toLocaleLowerCase('el-GR').replace(/[;,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/σταμάτα|σταματ[ηή]|τέλος|ακύρωσε/.test(text)) return { type: 'stop_navigation' };
    if (/κάμερ|ραντάρ|αστυνομ|έλεγχος|ελέγχους|camera|radar/.test(text)) return { type: 'safety_query' };
    if (/πού είμαι|που είμαι/.test(text)) return { type: 'current_status' };
    if (/ξανακέντρ|recenter|κέντρο/.test(text)) return { type: 'recenter' };
    const category = aliases.find(([, pattern]) => pattern.test(text))?.[0];
    if (category) {
      const cityMatch = text.match(/(?:στα|στη|στο|σε|για)\s+([\p{L}\s-]{3,40}?)(?:\s+(?:ανοιχτ|κοντά|τώρα)|$)/u);
      return { type: /πήγαιν|οδήγη|οδηγη|κατεύθυν|κοντινότερ|nearest/.test(text) ? 'nearby_destination' : 'poi_search', category, city: cityMatch?.[1]?.trim() || null, openNow: /ανοιχτ|τώρα/.test(text) };
    }
    if (/ξεκίνα|έναρξη/.test(text)) return { type: 'start_navigation' };
    if (/βρες|βρείτε|αναζήτη|ψάξε|δείξε|πού βρίσκεται|προορισμ|πήγαιν|οδήγη|οδηγη/.test(text)) return { type: 'destination_search', query: text.replace(/^.*?(?:βρες|βρείτε|αναζήτησε|αναζήτη|ψάξε|δείξε|πήγαιν|οδήγησε|οδηγησέ με)\s+/u, '').trim() || text };
    return { type: 'unknown' };
  };
})();
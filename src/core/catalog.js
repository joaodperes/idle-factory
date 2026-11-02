export async function loadCatalog() {
  const ids = ['facilities','resources','talents','research','investments','contracts'];
  const values = await Promise.all(ids.map(async id => {
    const response = await fetch(new URL(`../../data/catalog/${id}.json`, import.meta.url));
    if (!response.ok) throw new Error(`Catalog ${id} failed to load (${response.status})`);
    return response.json();
  }));
  return Object.fromEntries(ids.map((id, index) => [id, values[index]]));
}

/** Static, version-controlled game definitions. These are NOT player save files. */
export async function loadCatalogs() {
  const files = {
    BUILDINGS: 'buildings.json', RESEARCH: 'research.json',
    META: 'prestige.json', WORKER_CLASSES: 'workers.json'
  };
  const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const url = new URL(`../../data/catalog/${file}`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${file}: HTTP ${response.status}`);
    return [key, await response.json()];
  }));
  return Object.fromEntries(entries);
}

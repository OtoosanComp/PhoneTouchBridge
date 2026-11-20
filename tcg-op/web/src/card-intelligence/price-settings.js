import { getModifiers, saveModifiers } from './price-modifiers.js';

const $ = id => document.getElementById(id);
const FIELDS = [
  ['modUnlimited', 'Yu-Gi-Oh!', 'Unlimited'], ['mod1st', 'Yu-Gi-Oh!', '1st Edition'],
  ['modLimited', 'Yu-Gi-Oh!', 'Limited Edition'], ['modTin', 'Yu-Gi-Oh!', 'Collector Tin'],
  ['modRiftFoil', 'Riftbound', 'Foil'], ['modRiftAlt', 'Riftbound', 'Alternate Art'],
  ['modLangEs', 'language', 'ES'], ['modLangEn', 'language', 'EN']
];

async function load() {
  const mods = await getModifiers();
  for (const [id, group, key] of FIELDS) if ($(id)) $(id).value = String(mods[group][key]);
}

$('saveModifiersBtn')?.addEventListener('click', async () => {
  const values = { 'Yu-Gi-Oh!': {}, 'Riftbound': {}, language: {} };
  for (const [id, group, key] of FIELDS) if ($(id)) values[group][key] = $(id).value;
  try {
    await saveModifiers(values);
    await load();
    $('modifiersStatus').textContent = 'Ajustes guardados. Se aplican la próxima vez que cambies acabado, idioma o impresión.';
  } catch (error) {
    $('modifiersStatus').textContent = `No se pudieron guardar los ajustes: ${error.message}`;
  }
});

load().catch(() => {});

// Single source of truth for spot categories.
// Used by: AI parser prompt, admin UI, index frontend.

const SPOT_CATEGORIES = [
  { value: 'bookstore',     label: 'Bookstore',    core: true },
  { value: 'film_lab',      label: 'Film Lab',     core: true },
  { value: 'record_store',  label: 'Record Store', core: true },
  { value: 'cinema',        label: 'Cinema',       core: true },
  { value: 'gallery',       label: 'Gallery',      core: true },
  { value: 'coffee',        label: 'Coffee',       core: false },
  { value: 'eat',           label: 'Eat',          core: false },
  { value: 'drink',         label: 'Drink',        core: false },
  { value: 'retail',        label: 'Retail',       core: false },
  { value: 'other',         label: 'Other',        core: false },
];

module.exports = SPOT_CATEGORIES;

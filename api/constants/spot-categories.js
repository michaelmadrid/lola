// Single source of truth for spot categories.
// Used by: AI parser, admin UI, annex public, spots page, capture overlay.
// NOTE: values must match DB data — don't rename without a migration.

const SPOT_CATEGORIES = [
  { value: 'bookstore',   label: 'Bookstore',    core: true },
  { value: 'cinema',      label: 'Cinema',       core: true },
  { value: 'recordstore', label: 'Recordstore',  core: true },
  { value: 'gallery',     label: 'Gallery',      core: true },
  { value: 'make',        label: 'Make',         core: true },
  { value: 'visit',       label: 'Visit',        core: true },
  { value: 'shop',        label: 'Shop',         core: false },
  { value: 'coffee',      label: 'Coffee',       core: false },
  { value: 'eat',         label: 'Eat',          core: false },
  { value: 'drink',       label: 'Drink',        core: false },
  { value: 'stay',        label: 'Stay',         core: false },
  { value: 'other',       label: 'Other',        core: false },
];

module.exports = SPOT_CATEGORIES;

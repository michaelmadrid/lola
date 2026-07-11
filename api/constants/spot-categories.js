// Single source of truth for spot categories.
// Used by: AI parser, admin UI, annex public, spots page, capture overlay.
// NOTE: values must match DB data — don't rename without a migration.

const SPOT_CATEGORIES = [
  {
    value: 'bookstore',
    label: 'Bookstore',
    core: true,
    suggestions: ['Photobooks', 'Art Books', 'Literary', 'Secondhand', 'Zines'],
  },
  {
    value: 'cinema',
    label: 'Cinema',
    core: true,
    suggestions: ['Repertory', 'Arthouse', 'Drive-in', 'Outdoor'],
  },
  {
    value: 'recordstore',
    label: 'Recordstore',
    core: true,
    suggestions: ['Vinyl', 'New Releases', 'Secondhand', 'Jazz', 'Electronic'],
  },
  {
    value: 'gallery',
    label: 'Gallery',
    core: true,
    suggestions: ['Photography', 'Contemporary', 'Print', 'Sculpture', 'Commercial'],
  },
  {
    value: 'make',
    label: 'Make',
    core: true,
    suggestions: ['Film Lab', 'Darkroom', 'Screenprint', 'Risograph', 'Print Studio', 'Ceramics'],
  },
  {
    value: 'visit',
    label: 'Visit',
    core: true,
    suggestions: ['Museum', 'Architecture', 'Landmark', 'Public Space', 'Garden', 'Library'],
  },
  {
    value: 'shop',
    label: 'Shop',
    core: false,
    suggestions: ['Concept Store', 'Vintage', 'Clothing', 'Objects', 'Homewares'],
  },
  { value: 'coffee',      label: 'Coffee',      core: false },
  { value: 'eat',         label: 'Eat',         core: false },
  { value: 'drink',       label: 'Drink',       core: false },
  { value: 'stay',        label: 'Stay',        core: false },
  { value: 'other',       label: 'Other',       core: false },
];

module.exports = SPOT_CATEGORIES;

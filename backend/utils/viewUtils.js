const normalizeViewEntry = (view = {}, fallbackType = 'VIEW') => {
  const entry = { ...view };
  const name = entry.name || entry.viewname || entry.matviewname || entry.table_name || entry.view_name;
  const definition = entry.definition ?? entry.view_definition ?? entry.query ?? '';
  const computedType = (entry.type || entry.viewType || '').toUpperCase();
  const isMaterialized = Boolean(
    entry.isMaterialized ||
    entry.materialized ||
    /MATERIALIZED/i.test(computedType) ||
    /MATERIALIZED/i.test(String(entry.kind || ''))
  );

  return {
    ...entry,
    name,
    definition,
    type: computedType || (isMaterialized ? 'MATERIALIZED VIEW' : fallbackType),
    viewType: computedType || (isMaterialized ? 'MATERIALIZED VIEW' : fallbackType),
    isMaterialized,
  };
};

const mergeViews = (standardViews = [], materializedViews = []) => {
  const merged = [
    ...standardViews.map(view => normalizeViewEntry(view, 'VIEW')),
    ...materializedViews.map(view => normalizeViewEntry({ ...view, isMaterialized: true }, 'MATERIALIZED VIEW')),
  ];

  return merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

module.exports = { normalizeViewEntry, mergeViews };
